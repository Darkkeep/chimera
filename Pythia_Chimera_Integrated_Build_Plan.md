# Pythia + Chimera Integrated Build Plan

**Working strategy:** Pythia provides learning intelligence, orchestration, evidence, validation, and governed AI execution. Chimera provides the authoring environment, production workflow, media handling, preview, assessment implementation, and learning-package export.

**Primary architectural rule:**

> Pythia thinks. Chimera makes.

The two products remain independently useful while sharing a stable integration contract.

---

# 1. Target Product Architecture

```text
                         PYTHIA
                Learning Intelligence Engine
                           │
              Capability-driven API
                           │
            Requests ↓       ↑ Artifacts
                           │
                        CHIMERA
                   Learning Production
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
   Storyboards          Assessments          Media
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    Preview / Validation
                           │
              SCORM / QTI / HTML5 / xAPI
```

Pythia must not become a Chimera backend module.

Chimera must not become responsible for learning-engineering reasoning.

Their shared boundary is a versioned contract.

---

# 2. Development Priorities

Development proceeds in this order:

1. Establish the shared integration contract.
2. Expose Pythia as a service.
3. Abstract Chimera's learning-intelligence provider.
4. Complete one small end-to-end capability.
5. Add proposal/review workflows.
6. Add storyboard transformation.
7. Add assessment design.
8. Add whole-course review.
9. Move model/provider orchestration progressively into Pythia.
10. Generalize Pythia so Chimera remains its reference client rather than its only client.

After the first integration milestone, both repositories should advance together.

---

# 3. Architectural Ownership

## Pythia owns

Pythia is responsible for:

- Learning analysis
- Learning-design recommendations
- Storyboard analysis
- Storyboard transformation proposals
- Assessment design
- Objective alignment
- Standards selection
- SCORM/cmi5/xAPI recommendations
- Research and evidence handling
- Source-currentness analysis
- Accessibility recommendations
- Course evaluation
- Capability routing
- Specialist orchestration
- Model/provider routing
- AI execution policies
- Provenance
- Risk and decision records
- Validation status
- Human-review state
- Audit-ready artifact envelopes

Pythia determines **what should be done, why it should be done, and what evidence supports the decision.**

## Chimera owns

Chimera is responsible for:

- Project management
- PowerPoint ingestion
- Slide parsing
- Scene editing
- Canvas/editor behavior
- Media libraries
- Asset storage
- Image/audio attachment
- Template management
- Storyboard persistence
- Assessment implementation
- Learner preview
- Accessibility authoring
- Scene sequencing
- Version history
- Completion rules
- QTI generation
- SCORM generation
- Learning-package construction
- Build reports
- Export workflows
- Production UI

Chimera determines **how approved instructional designs become production artifacts.**

---

# 4. Shared Integration Principles

The following are non-negotiable.

## 4.1 Capability-based requests

Chimera never asks Pythia to invoke a named specialist.

Bad:

```text
Run Assessment Designer.
```

Correct:

```text
assessment.design
```

Pythia determines the provider.

This preserves the ability to replace specialists, models, workflows, or implementations without changing Chimera.

---

## 4.2 Asynchronous task execution

Chimera must not assume AI work completes inside one HTTP request.

Tasks follow a lifecycle such as:

```text
submitted
queued
running
awaiting_review
completed
failed
cancelled
```

Pythia returns a task identifier immediately.

Chimera polls or subscribes to task state.

---

## 4.3 Proposals before mutation

Pythia does not directly overwrite canonical Chimera content.

AI output enters Chimera as a proposal.

```text
Canonical artifact
      │
      ├── Pythia proposal
      │
      ├── human review
      │
      └── accept / edit / reject
```

Only an explicit acceptance operation changes canonical project state.

---

## 4.4 Validation is not approval

Schema validation means:

> This artifact is structurally valid.

It does not mean:

> This instructional decision is approved.

Human review remains explicit.

---

## 4.5 Stable identifiers

Pythia and Chimera share durable identifiers for:

- Project
- Course
- Scene
- Objective
- Assessment
- Question
- Asset
- Evidence source
- Proposal
- Task
- Artifact

A scene identifier must survive reordering.

For example:

```text
scene_a81f73
```

rather than:

```text
slide_14
```

The original PowerPoint slide number remains provenance metadata.

---

# 5. Integration Contract v1

Pythia owns the canonical v1 contracts initially.

A future `pythia-contracts` repository may be split out once the API stabilizes.

## Task request

Conceptual structure:

```json
{
  "schema_version": "1.0",
  "task_id": "task-uuid",
  "capability": "storyboard.analyze",
  "consumer": "chimera",
  "project_id": "project-uuid",
  "inputs": [],
  "constraints": {},
  "context": {}
}
```

## Artifact response

```json
{
  "schema_version": "1.0",
  "artifact_id": "artifact-uuid",
  "artifact_type": "storyboard-analysis",
  "producer": "pythia",
  "task_id": "task-uuid",
  "status": "draft",
  "validation": "passed",
  "sources": [],
  "payload": {}
}
```

The Pythia artifact envelope remains stable.

Domain payloads may evolve independently.

---

# 6. Pythia Build Track

## Milestone P1: Engine Service

### Goal

Turn Pythia from a repository-operated kernel into a callable service.

### Build

Create a service layer such as:

```text
service/
├── app.py
├── api/
├── tasks/
├── artifacts/
├── execution/
└── contracts/
```

Expose initial endpoints:

```text
GET  /health
GET  /capabilities
POST /tasks
GET  /tasks/{task_id}
POST /tasks/{task_id}/cancel
GET  /artifacts/{artifact_id}
POST /artifacts/{artifact_id}/review
```

### Requirements

- Existing Kernel capability registry remains authoritative.
- Existing task contracts remain authoritative.
- Existing artifact envelopes remain authoritative.
- Service layer calls Kernel functions rather than duplicating them.
- CLI and MCP remain adapters.
- HTTP service becomes another adapter, not a new Pythia architecture.

### Acceptance criteria

A synthetic task can be submitted via HTTP and produce the same validated artifact as local execution.

---

# 7. Chimera Build Track

## Milestone C1: Learning Intelligence Abstraction

### Goal

Prevent Chimera application logic from becoming dependent on any single AI provider.

Introduce:

```python
class LearningIntelligenceProvider(Protocol):

    def capabilities(self): ...
    def submit_task(self, request): ...
    def task_status(self, task_id): ...
    def artifact(self, artifact_id): ...
    def cancel_task(self, task_id): ...
```

Implement:

```text
PythiaProvider
```

Keep existing media-generation provider logic intact initially.

### Important separation

Current media generation remains:

```text
Chimera → media provider
```

Learning reasoning becomes:

```text
Chimera → Pythia
```

These can converge later.

### Acceptance criteria

Chimera can connect to Pythia, query supported capabilities, submit a mock task, receive an artifact, and display its state without any OpenAI-specific logic in the relevant UI.

---

# 8. Integration Milestone I1: Storyboard Analyze

This should be the first real shared capability.

## Capability

```text
storyboard.analyze
```

## Chimera supplies

- Scene ID
- Source slide ID if applicable
- Scene title
- Scene text
- Speaker notes
- Existing purpose
- Existing layout
- Objective references
- Attached-media metadata
- Relevant project constraints

## Pythia returns

- Probable instructional purpose
- Content issues
- Missing information
- Suggested treatment
- Suggested interaction
- Possible objective alignment
- Evidence/uncertainty
- Recommended next action

## Chimera UI

Add:

```text
Analyze with Pythia
```

Result appears in a review panel.

No automatic mutation.

### Acceptance criteria

A user selects a scene, invokes Pythia, receives a valid analysis, and can close the result without changing the storyboard.

This becomes the permanent cross-repository smoke test.

---

# 9. Integration Milestone I2: Storyboard Transform

## Capability

```text
storyboard.transform
```

Pythia converts one or more source scenes into a proposed instructional treatment.

### Pythia responsibilities

Produce:

- Proposed scene sequence
- Scene purposes
- Learner-facing content
- Interaction recommendations
- Production notes
- Media requirements
- Assessment opportunities
- Source references
- Rationale

### Chimera responsibilities

Render a comparison UI:

```text
CURRENT                         PYTHIA PROPOSAL

Scene 1                         Scene A
Scene 2                         Scene B
Scene 3                         Scene C

                 ACCEPT
                  EDIT
                 REJECT
```

Accepting a proposal creates a normal Chimera revision/history entry.

### Acceptance criteria

An imported PowerPoint subset can become a proposed Chimera storyboard without replacing the original until accepted.

---

# 10. Integration Milestone I3: Assessment Design

## Capability

```text
assessment.design
```

### Inputs

- Objectives
- Storyboard scenes
- Existing assessment items
- Audience
- Constraints
- Desired difficulty
- Completion rules

### Pythia returns

- Assessment blueprint
- Objective-to-item mapping
- Item recommendations
- Draft items
- Distractors
- Feedback
- Rationale
- Alignment findings

### Chimera converts approved proposals into

- Single choice
- Multiple correct
- True/false
- Ordering
- Matching
- Drag and drop
- Short answer

using Chimera's native assessment model.

### Acceptance criteria

A Pythia assessment proposal can be accepted into Chimera and previewed using Chimera's existing learner assessment engine.

---

# 11. Integration Milestone I4: Accessibility Review

## Capability

```text
accessibility.review
```

### Pythia evaluates

- Image purpose
- Existing alt text
- Decorative status
- Narration
- Transcript/caption status
- Interaction instructions
- Content clarity

### Pythia returns

Recommendations only.

### Chimera provides

- Accept
- Edit
- Ignore
- Mark reviewed

### Acceptance criteria

Accessibility recommendations remain distinguishable from Chimera's deterministic validation checks.

---

# 12. Integration Milestone I5: Whole-Course Review

This is the first major Pythia showcase capability.

## User experience

```text
Review Course with Pythia
```

Pythia orchestrates appropriate specialists.

The result is a structured review:

```text
Objectives                3 findings
Instructional alignment   6 findings
Assessment                2 findings
Accessibility             4 findings
Source currency           5 review items
Standards                 Ready
Tracking                  Ready
Packaging                 Ready
```

Each finding links to the relevant Chimera object.

### Acceptance criteria

A user can move from course-level finding directly to the affected scene, objective, assessment, or asset.

---

# 13. Model and Provider Strategy

## Phase 1

Chimera retains:

- Image generation
- Narration generation
- Existing provider credential handling

Pythia manages learning-intelligence model calls.

## Phase 2

Pythia gains provider routing for:

- Text reasoning
- Structured generation
- Research
- Evaluation

## Phase 3

Pythia may broker:

- Image generation
- Narration
- Other specialized AI services

At that point:

```text
Chimera → Pythia → provider
```

becomes the dominant pattern.

Chimera should never need to care whether Pythia uses:

- OpenAI
- another hosted model
- local models
- enterprise-hosted models
- deterministic tools
- specialist services

---

# 14. Chimera UI Evolution

The current concept of:

```text
AI Connection
```

should eventually become:

```text
Intelligence Engine
```

Example:

```text
INTELLIGENCE ENGINE

Pythia
Connected

Engine version
1.x

Capabilities
✓ Storyboard analysis
✓ Storyboard transformation
✓ Assessment design
✓ Accessibility review
✓ Course review

Media services
OpenAI

[Test engine]
```

This reinforces the product architecture:

> Chimera is powered by Pythia, not directly by a model.

---

# 15. Proposal Data Model

Chimera should introduce a first-class proposal entity.

Example:

```text
Proposal
├── proposal_id
├── project_id
├── source_object_ids
├── pythia_task_id
├── pythia_artifact_id
├── capability
├── schema_version
├── created_at
├── status
│   ├── pending
│   ├── accepted
│   ├── edited
│   └── rejected
├── payload
└── provenance
```

Accepted proposals should retain their origin.

Never discard the proposal simply because it was incorporated.

---

# 16. Provenance Requirements

Every accepted Pythia contribution should retain:

```text
Generated by
Pythia

Capability
storyboard.transform

Task ID
task-...

Artifact ID
artifact-...

Engine version
...

Schema version
...

Source objects
scene-...
objective-...

Created
...

Reviewed
...

Reviewer
...

Decision
accepted / edited / rejected
```

This can remain largely invisible during normal authoring while supporting audits, debugging, evaluation, and future enterprise requirements.

---

# 17. Cross-Repository Testing

Create a shared golden fixture.

Example:

```text
integration-fixtures/
└── simple-course/
    ├── source-project.json
    ├── source-storyboard.json
    ├── expected-task.json
    ├── expected-artifact.schema.json
    └── expected-accepted-project.json
```

## CI flow

```text
Chimera fixture
      ↓
Pythia task submission
      ↓
Pythia capability execution
      ↓
valid artifact envelope
      ↓
Chimera proposal conversion
      ↓
proposal acceptance
      ↓
valid Chimera project
      ↓
learner preview
      ↓
SCORM build
```

The eventual golden-path integration test should be:

```text
PPTX
 ↓
Chimera import
 ↓
Pythia analysis
 ↓
Pythia transformation
 ↓
Human acceptance
 ↓
Chimera production
 ↓
Assessment
 ↓
Validation
 ↓
SCORM
```

---

# 18. Repository Rules

## Pythia must not contain

- Chimera UI code
- Chimera project persistence
- SCORM packaging implementation
- PPT rendering
- Media-library implementation
- Chimera-specific frontend logic

## Chimera must not contain

- Specialist prompts
- Capability-routing logic
- Instructional-analysis engines
- Assessment-design reasoning
- Learning-engineering orchestration
- Research-agent logic
- Model-specific instructional behavior

Adapters are allowed.

Ownership leakage is not.

---

# 19. Contract Repository

Do not create a third repository immediately.

For Integration Contract v1:

```text
Pythia/
└── schemas/
```

remains authoritative.

Once at least three integration capabilities are stable, create:

```text
Darkkeep/pythia-contracts
```

Potential contents:

```text
schemas/
openapi/
examples/
generated-clients/
compatibility/
contract-tests/
CHANGELOG.md
```

Both products then consume versioned contract releases.

---

# 20. Versioning Strategy

Version separately:

```text
Pythia Engine API
1.x

Artifact Envelope
1.x

Storyboard Analysis
1.x

Storyboard Proposal
1.x

Assessment Proposal
1.x

Accessibility Review
1.x
```

A new Pythia release must not require a simultaneous Chimera release unless the contract major version changes.

Likewise, Chimera development must not require a Pythia change for ordinary authoring features.

---

# 21. Error and Degradation Strategy

Chimera must remain usable when Pythia is unavailable.

Examples:

```text
Pythia unavailable
```

does not prevent:

- Editing
- Preview
- Assessment editing
- Media work
- Validation
- Export

Pythia-dependent controls should degrade gracefully:

```text
Pythia is currently unavailable.
Your project remains fully editable.
```

No canonical data should become inaccessible because the intelligence engine is offline.

---

# 22. Security Boundary

Pythia should receive only information needed for the requested capability.

Chimera should explicitly construct the task payload rather than sending an entire project by default.

Example:

```text
storyboard.analyze(scene 7)
```

should not automatically transmit:

```text
entire course
all source documents
all media
all assessments
user metadata
```

Data minimization becomes part of the contract.

Enterprise deployments should eventually allow Pythia execution against approved provider configurations independent of Chimera.

---

# 23. Development Sequence

## Sprint 1: Contract Spine

### Pythia
- Engine service skeleton
- `/health`
- `/capabilities`
- task request schema
- artifact response schema
- asynchronous task state
- API contract tests

### Chimera
- `LearningIntelligenceProvider`
- `PythiaProvider`
- engine configuration
- health check
- capability discovery
- task state client

### Shared
- `storyboard.analyze` schema
- first integration fixture

**Exit condition:** Chimera can submit a synthetic task to Pythia and receive a validated artifact.

**Implementation status (2026-10-15):** Complete. Pythia provides the Engine
API, task lifecycle, capability discovery, artifact retrieval, and schema
validation. Chimera provides its learning-intelligence provider, connection
configuration, discovery, submission, and polling client. The synthetic
round-trip is compatibility evidence only; it does not grant approval or mutate
canonical Chimera content.

---

# 24. Sprint 2: Real Scene Analysis

### Pythia
- Implement `storyboard.analyze`
- Route through capability registry
- Return evidence-aware artifact
- Add evaluation fixture

### Chimera
- Add Analyze with Pythia
- Add results panel
- Add task progress
- Add failure/retry handling

**Exit condition:** Real scene content completes the entire round trip.

**Implementation status (2026-10-15):** Pythia complete. `storyboard.analyze`
is registered to the Storyboard Producer and accepts one scene-scoped input with
stable identifiers plus title, body text, speaker notes, and objective IDs. It
returns a structurally validated draft with evidence-linked findings,
recommendations, uncertainties, and review questions. It rejects identifier-only
requests rather than inferring unavailable source content. See the Sprint 2
handoff for Chimera's required request extension and result rendering work.

---

# 25. Sprint 3: Proposal Infrastructure

### Pythia
- Add proposal artifact conventions
- Add source-object references
- Add revision metadata

### Chimera
- Proposal persistence
- Accept
- Edit
- Reject
- History integration
- Provenance storage

**Exit condition:** AI-generated changes are never applied outside the proposal workflow.

---

# 26. Sprint 4: Storyboard Transformation

### Pythia
- `storyboard.transform`
- Multi-scene input
- Instructional-treatment output
- Rationale/evidence

### Chimera
- Before/after comparison
- Proposed scene creation
- Bulk accept/reject
- Scene-history integration

**Exit condition:** A PowerPoint sequence can become a reviewed Chimera storyboard.

---

# 27. Sprint 5: Assessment Integration

### Pythia
- `assessment.design`
- Blueprint schema
- Objective alignment
- Item proposals

### Chimera
- Assessment-proposal viewer
- Native-model conversion
- Preview integration
- Validation integration

**Exit condition:** An approved Pythia item functions as a native Chimera assessment.

---

# 28. Sprint 6: Course Review

### Pythia
- Multi-specialist orchestration
- Learning-design review
- Assessment review
- Standards review
- Accessibility review
- Research/currency review
- Evaluation summary

### Chimera
- Course Review workspace
- Finding categories
- Object deep links
- Review status
- Resolution workflow

**Exit condition:** Pythia can inspect a full Chimera course and produce actionable findings linked to real project objects.

---

# 29. Sprint 7: Provider Consolidation

### Pythia
- Provider registry
- Model selection
- Usage telemetry
- Budget controls
- retry policy
- provider fallback policy

### Chimera
- Remove remaining learning-reasoning calls to direct providers
- Keep production media adapters temporarily
- Replace AI model settings with Intelligence Engine settings

**Exit condition:** Chimera has no direct dependency on a text-reasoning model provider.

---

# 30. Sprint 8: Production Hardening

## Pythia

- Authentication
- Authorization
- Tenant context
- Request limits
- Observability
- audit logs
- retry/recovery
- job persistence
- provider health
- structured error model

## Chimera

- Authentication mapping
- engine permissions
- graceful offline mode
- administrator controls
- capability-aware UI
- usage/audit viewer

**Exit condition:** Multiuser pilot deployment is supportable.

---

# 31. Sprint 9: Contract Extraction

If the previous milestones prove stable:

Create:

```text
pythia-contracts
```

Move stable public contracts there.

Add compatibility matrices:

| Chimera | Pythia Engine | Contracts |
|---|---|---|
| 1.0 | 1.x | 1.x |
| 1.1 | 1.x | 1.x |
| 2.0 | 2.x | 2.x |

Generate client types where practical.

---

# 32. Sprint 10: End-to-End Golden Path

Demonstrate:

```text
Legacy PowerPoint
       ↓
Chimera import
       ↓
Pythia analysis
       ↓
Human review
       ↓
Pythia storyboard transformation
       ↓
Human approval
       ↓
Chimera production
       ↓
Pythia assessment design
       ↓
Chimera assessment implementation
       ↓
Pythia course review
       ↓
Human release decision
       ↓
Chimera SCORM export
```

This becomes:

- Regression fixture
- Product demo
- Sales demonstration
- Design-partner workflow
- Enterprise proof-of-concept

## Execution record (2026-10-15)

- Added and passed an opt-in local integration regression covering legacy PPTX import, all four Pythia capabilities, proposal and assessment decisions, course-review finding resolution, explicit `approved` release stage, and SCORM 2004 package/report checks.
- The regression uses isolated project storage and deterministic local Pythia providers. Scripted API decisions verify the human-review boundaries but are not human SME or release approval.
- This qualifies the local integration path as a regression fixture. A live LMS check, external-provider qualification, and an operator-led product/design-partner demo remain separate gates.
- Run instructions and limits: [Pythia Sprint 10 Golden Path Handoff](docs/pythia-sprint-10-golden-path-handoff.md).

---

# 33. Definition of Done for Every Integrated Capability

No new Pythia/Chimera capability is complete until all of these exist:

- Stable capability ID
- Defined request schema
- Defined output schema
- Pythia implementation
- Chimera adapter
- Chimera user experience
- Proposal/review behavior if content-changing
- Provenance
- Failure handling
- Contract test
- Pythia unit/evaluation tests
- Chimera integration test
- Cross-repository golden fixture
- Documentation
- Version declaration

This prevents half-integrated AI features.

---

# 34. Parallel Development Rule

After Sprint 1, development should proceed in paired slices.

```text
PYTHIA                         CHIMERA

Capability definition   →     User need
        ↓                        ↓
Execution              ←      Adapter
        ↓                        ↓
Artifact               →      Proposal/UI
        ↓                        ↓
Validation             ←      Acceptance
        └──── integration test ─┘
```

No major Pythia capability should be expanded without a credible consumer use case.

No Chimera AI feature should be added without a corresponding Pythia capability contract.

---

# 35. Near-Term Backlog Priority

## Pythia

### P0
- HTTP Engine API
- Async task execution
- Capability discovery
- Public contract versioning
- `storyboard.analyze`

### P1
- `storyboard.transform`
- `assessment.design`
- Proposal artifacts
- Consumer context
- task persistence

### P2
- `accessibility.review`
- `course.review`
- provider routing
- telemetry
- budget controls

### P3
- enterprise auth
- tenancy
- hosted deployment
- SDKs
- external consumers

## Chimera

### P0
- `LearningIntelligenceProvider`
- `PythiaProvider`
- engine connection
- capability discovery
- Pythia task UI

### P1
- proposal entity
- proposal review UI
- scene analysis
- storyboard transformation

### P2
- assessment proposal ingestion
- accessibility recommendations
- course review workspace
- provenance viewer

### P3
- enterprise engine administration
- advanced audit UI
- provider-independent media workflow
- external Pythia deployment configuration

---

# 36. Features to Avoid for Now

Do not prioritize:

- Full autonomous ADDIE execution
- Pythia-owned LMS functions
- Pythia-owned authoring UI
- Chimera-owned instructional agents
- Automatic AI publication
- Auto-approval
- Huge multi-agent workflows
- FedRAMP-specific architecture
- Broad marketplace integrations
- Building every Pythia specialist into Chimera
- Moving all media generation into Pythia immediately

The near-term goal is not maximum capability.

It is **a clean, durable seam between the two products.**

---

# 37. Commercial Product Story

The technical architecture should reinforce the eventual product story.

## Pythia

**Learning intelligence infrastructure**

Pythia analyzes, recommends, designs, validates, evaluates, and preserves the reasoning behind learning-engineering decisions.

## Chimera

**AI-assisted learning production**

Chimera transforms source materials and approved instructional designs into editable, interactive, standards-compliant learning products.

## Together

> **Pythia decides what learning should become. Chimera turns those decisions into something learners can use.**

---

# 38. Immediate Next Actions

Sprints 1 and Pythia's Sprint 2 implementation are complete. The next work is:

1. Chimera extends its scene-analysis submission to include `scene_content`
       with title, body text, speaker notes, and objective IDs.
2. Chimera renders object-shaped Pythia findings and recommendations as a
       reviewable analysis result, with task progress and recoverable failure/retry
       handling.
3. Jointly qualify a real scene-content round trip on the local Pythia port
       `8001`, while Chimera continues to use port `8000`.
4. Add cross-product CI and freeze the validated Integration Contract v1.
5. Begin Sprint 3 proposal infrastructure; no generated recommendation may
       change canonical Chimera content until the explicit proposal workflow exists.

---

# 39. First Major Release Target

The first meaningful joint release should not claim "complete AI authoring."

It should demonstrate:

## Pythia + Chimera Integration Preview 1

A user can:

1. Import a PowerPoint into Chimera.
2. Select a scene.
3. Ask Pythia to analyze it.
4. Review Pythia's recommendation.
5. Ask Pythia to redesign the scene.
6. Compare the proposal to the original.
7. Accept or modify the proposal.
8. Preserve provenance.
9. Preview the revised experience.
10. Export a valid learning package.

That proves the architecture.

Everything beyond that becomes expansion rather than reinvention.

---

# 40. End-State

The desired architecture is not:

```text
Chimera with some AI
```

and not:

```text
Pythia with a course builder
```

It is:

```text
                 PYTHIA PLATFORM
                Intelligence Layer
                        │
          ┌─────────────┼─────────────┐
          │             │             │
       Chimera       Other Apps    Enterprise API
          │
      Production
          │
   Learning Products
```

Chimera becomes Pythia's first flagship client.

Pythia becomes Chimera's preferred intelligence engine.

Each remains independently valuable.

Together they form the foundation of a broader learning-engineering platform.
