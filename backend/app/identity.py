import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Protocol

from pydantic import BaseModel, Field, model_validator

from .platform import ActorContext, LOCAL_ACTOR, get_event_delivery_policy, event_transaction, get_actor_context


PlatformRole = Literal["author", "reviewer", "instructional-designer", "administrator"]


class UserRecord(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    displayName: str = Field(min_length=1, max_length=120)
    status: Literal["active", "disabled"] = "active"


class TeamRecord(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    installationId: str | None = None


class ProjectTeamMembership(BaseModel):
    projectId: str
    teamId: str


class Membership(BaseModel):
    userId: str
    teamId: str
    role: PlatformRole
    grantedAt: datetime | None = None
    grantSource: str = "legacy-unspecified"


class ProjectMembership(BaseModel):
    projectId: str
    userId: str
    role: PlatformRole
    grantedAt: datetime | None = None
    grantedBy: str | None = None


class ProjectMembershipCreate(BaseModel):
    userId: str = Field(min_length=1, max_length=120)
    role: PlatformRole


class OrganizationPolicy(BaseModel):
    deploymentMode: Literal["single-user", "team"] = "single-user"
    identityProvider: Literal["local", "encarta", "oidc", "saml", "adapter"] = "local"
    tenancyMode: Literal["single-organization", "multi-organization"] = "single-organization"
    userProvisioning: Literal["invitation", "directory-sync", "invitation-and-sync"] = "invitation"
    trackingMode: Literal["disabled", "local", "centralized"] = "local"
    analyticsIdentity: Literal["project-and-user", "organization-anonymous"] = "organization-anonymous"
    allowGuestReviewers: bool = False
    reviewAccess: Literal["authenticated", "invited-guests", "no-external-review"] = "no-external-review"
    adminCanViewProjectContent: bool = True
    auditRetentionDays: int = Field(default=365, ge=1, le=3650)
    dataResidency: str = Field(default="local", min_length=1, max_length=120)

    @model_validator(mode="after")
    def validate_installation_choices(self) -> "OrganizationPolicy":
        if self.deploymentMode == "single-user" and self.identityProvider != "local":
            raise ValueError("Single-user installations must use the local identity provider")
        if self.reviewAccess == "invited-guests" and not self.allowGuestReviewers:
            raise ValueError("Invited guest review requires allowGuestReviewers")
        if self.trackingMode == "disabled" and self.analyticsIdentity != "organization-anonymous":
            raise ValueError("Disabled tracking requires organization-anonymous analytics")
        return self


class IdentitySnapshot(BaseModel):
    actor: ActorContext
    user: UserRecord
    teams: list[TeamRecord] = Field(default_factory=list)
    memberships: list[Membership] = Field(default_factory=list)
    projectMemberships: list[ProjectMembership] = Field(default_factory=list)
    projectTeams: list[ProjectTeamMembership] = Field(default_factory=list)
    users: list[UserRecord] = Field(default_factory=list)
    policy: OrganizationPolicy = Field(default_factory=OrganizationPolicy)


class IdentityDirectory(Protocol):
    def snapshot(self) -> IdentitySnapshot:
        ...

    def roles_for(self, user_id: str, project_id: str | None = None) -> set[PlatformRole]:
        ...


class LocalIdentityDirectory:
    def __init__(self, root: Path, actor: ActorContext = LOCAL_ACTOR) -> None:
        self.path = root / "identity" / "directory.json"
        self.actor = actor

    def snapshot(self) -> IdentitySnapshot:
        if not self.path.is_file():
            with event_transaction(self.path.parent):
                if not self.path.is_file():
                    snapshot = self._default_snapshot()
                    self._write(snapshot)
                    return snapshot
        return IdentitySnapshot.model_validate(json.loads(self.path.read_text(encoding="utf-8")))

    def roles_for(self, user_id: str, project_id: str | None = None) -> set[PlatformRole]:
        snapshot = self.snapshot()
        user = next((item for item in [snapshot.user, *snapshot.users] if item.id == user_id), None)
        if user is None or user.status != "active":
            return set()
        team_ids = {team.id for team in snapshot.teams if team.installationId in (None, snapshot.actor.installationId)}
        if project_id is not None:
            team_ids &= {item.teamId for item in snapshot.projectTeams if item.projectId == project_id}
        roles = {membership.role for membership in snapshot.memberships if membership.userId == user_id and membership.teamId in team_ids}
        if project_id is not None:
            roles.update(
                membership.role
                for membership in snapshot.projectMemberships
                if membership.userId == user_id and membership.projectId == project_id
            )
        return roles

    def project_installation(self, project_id: str) -> str | None:
        if Path(project_id).name != project_id or project_id in {".", ".."}:
            return None
        try:
            metadata = json.loads((self.path.parent.parent / "projects" / project_id / "project.json").read_text(encoding="utf-8"))
            return metadata.get("installationId")
        except (OSError, ValueError):
            return None

    def project_memberships(self, project_id: str) -> list[ProjectMembership]:
        return [membership for membership in self.snapshot().projectMemberships if membership.projectId == project_id]

    def add_project_membership(self, membership: ProjectMembership) -> ProjectMembership:
        self.snapshot()
        with event_transaction(self.path.parent):
            snapshot = self.snapshot()
            if membership.userId not in {item.id for item in [snapshot.user, *snapshot.users]}:
                raise ValueError("Membership requires a known installation user")
            if self.project_installation(membership.projectId) not in (None, snapshot.actor.installationId):
                raise ValueError("Project belongs to another installation")
            membership = membership.model_copy(update={"grantedBy": get_actor_context().actorId, "grantedAt": datetime.now(timezone.utc)})
            memberships = [item for item in snapshot.projectMemberships if not (item.projectId == membership.projectId and item.userId == membership.userId)]
            memberships.append(membership)
            self._write(snapshot.model_copy(update={"projectMemberships": memberships}))
        return membership

    def policy(self) -> OrganizationPolicy:
        return self.snapshot().policy

    def update_policy(self, policy: OrganizationPolicy) -> OrganizationPolicy:
        self.snapshot()
        with event_transaction(self.path.parent):
            snapshot = self.snapshot()
            self._write(snapshot.model_copy(update={"policy": policy}))
        return policy

    def _default_snapshot(self) -> IdentitySnapshot:
        user = UserRecord(id=self.actor.actorId, displayName=self.actor.actorDisplayName)
        team = TeamRecord(id=self.actor.installationId, name="Local workspace")
        memberships = [Membership(userId=user.id, teamId=team.id, role=role, grantedAt=datetime.now(timezone.utc), grantSource="local-bootstrap") for role in ("author", "reviewer", "instructional-designer", "administrator")]
        return IdentitySnapshot(
            actor=self.actor,
            user=user,
            teams=[team],
            memberships=memberships,
            policy=OrganizationPolicy(trackingMode=get_event_delivery_policy().mode),
        )

    def _write(self, snapshot: IdentitySnapshot) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(f".{self.path.name}.{uuid.uuid4().hex}.tmp")
        temporary.write_text(snapshot.model_dump_json(indent=2), encoding="utf-8")
        temporary.replace(self.path)


class RoleBasedAuthorizationPolicy:
    actionRoles: dict[str, set[PlatformRole]] = {
        "project.view": {"author", "reviewer", "instructional-designer", "administrator"},
        "project.metadata.view": {"author", "reviewer", "instructional-designer", "administrator"},
        "project.list": {"author", "reviewer", "instructional-designer", "administrator"},
        "project.export": {"author", "instructional-designer"},
        "identity.view": {"author", "reviewer", "instructional-designer", "administrator"},
        "template.view": {"author", "instructional-designer", "administrator"},
        "project.create": {"author", "instructional-designer", "administrator"},
        "project.mutate": {"author", "instructional-designer", "administrator"},
        "project.settings.update": {"author", "instructional-designer", "administrator"},
        "project.restore": {"author", "instructional-designer", "administrator"},
        "project.import": {"author", "instructional-designer", "administrator"},
        "scene.manage": {"author", "instructional-designer", "administrator"},
        "media.manage": {"author", "instructional-designer", "administrator"},
        "reference.create": {"author", "instructional-designer", "administrator"},
        "template.manage": {"author", "instructional-designer", "administrator"},
        "review.comment.create": {"author", "reviewer", "instructional-designer", "administrator"},
        "review.reply.create": {"author", "reviewer", "instructional-designer", "administrator"},
        "review.comment.resolve": {"author", "reviewer", "instructional-designer", "administrator"},
        "enhancement.proposal.create": {"author", "instructional-designer", "administrator"},
        "enhancement.proposal.decide": {"author", "instructional-designer"},
        "enhancement.job.create": {"author", "instructional-designer", "administrator"},
        "enhancement.job.manage": {"author", "instructional-designer", "administrator"},
        "media.job.create": {"author", "instructional-designer", "administrator"},
        "media.job.manage": {"author", "instructional-designer", "administrator"},
        "media.candidate.manage": {"author", "instructional-designer"},
        "project.membership.manage": {"administrator"},
        "admin.policy.manage": {"administrator"},
        "admin.audit.view": {"administrator"},
    }

    def __init__(self, directory: IdentityDirectory) -> None:
        self.directory = directory

    def allows(self, context: ActorContext, action: str, project_id: str | None = None) -> bool:
        required_roles = self.actionRoles.get(action)
        if required_roles is None:
            return False
        snapshot = self.directory.snapshot()
        if context.installationId != snapshot.actor.installationId or context.deploymentMode != snapshot.policy.deploymentMode:
            return False
        user = next((item for item in [snapshot.user, *snapshot.users] if item.id == context.actorId), None)
        if user is None or user.status != "active":
            return False
        if context.deploymentMode == "single-user":
            return context.actorId == snapshot.actor.actorId
        organization_roles = self.directory.roles_for(context.actorId)
        if project_id is None:
            if action == "project.list" and any(item.userId == context.actorId and self.directory.project_installation(item.projectId) == context.installationId for item in snapshot.projectMemberships):
                return True
            return bool(organization_roles & required_roles)
        if self.directory.project_installation(project_id) != context.installationId:
            return False
        roles = self.directory.roles_for(context.actorId, project_id)
        metadata = json.loads((self.directory.path.parent.parent / "projects" / project_id / "project.json").read_text(encoding="utf-8"))
        if metadata.get("ownerId") == context.actorId:
            roles.update(organization_roles & {"author", "instructional-designer"})
        if "administrator" in organization_roles:
            roles.add("administrator")
        if roles == {"administrator"} and not snapshot.policy.adminCanViewProjectContent and action not in {"project.metadata.view", "project.membership.manage", "admin.audit.view"}:
            return False
        return bool(roles & required_roles)
