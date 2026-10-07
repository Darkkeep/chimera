import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from backend.app.auth import EncartaIdentityProvider, LocalIdentityProvider
from backend.app.identity import LocalIdentityDirectory, OrganizationPolicy
from backend.app.platform import LOCAL_ACTOR


class AuthTests(unittest.TestCase):
    def test_local_provider_resolves_directory_actor(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            provider = LocalIdentityProvider(LocalIdentityDirectory(Path(temporary)))

            actor = provider.resolve(Mock())

            self.assertEqual(actor, LOCAL_ACTOR)

    def test_local_provider_rejects_a_team_actor(self) -> None:
        team_actor = LOCAL_ACTOR.model_copy(update={
            "actorId": "team-user",
            "actorDisplayName": "Team user",
            "installationId": "org-1",
            "deploymentMode": "team",
        })
        directory = Mock()
        directory.snapshot.return_value.actor = team_actor

        with self.assertRaisesRegex(RuntimeError, "single-user"):
            LocalIdentityProvider(directory).resolve(Mock())

    def test_encarta_provider_fails_closed_until_endpoint_and_validation_are_configured(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = LocalIdentityDirectory(Path(temporary))
            directory.update_policy(OrganizationPolicy(deploymentMode="team", identityProvider="encarta"))
            provider = EncartaIdentityProvider(directory)

            with self.assertRaisesRegex(RuntimeError, "CHIMERA_ENCARTA_URL"):
                provider.resolve(Mock())


if __name__ == "__main__":
    unittest.main()
