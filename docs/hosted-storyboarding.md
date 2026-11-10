# Hosted automatic storyboarding

The Chimera trust profile can draft native scene text and initial scenes through
the hosted Pythia engine. A desktop adapter is not required for these operations.
The source change needs the coordinated Pythia engine update before rollout.

## Start from an externally agreed design

1. Save the agreed design under **Sources**, as a document, pasted text or selected
   Pythia output. Source intake alone does not create scenes.
2. Open **Review tools > Review suggestions**, choose **Whole course**, select the
   readable reference and state the desired scene sequence in **Enhancement goal**.
3. Leave specialist tools and public web research off. **Preview submission** checks
   connection support without a model call. **Submit run** explicitly requests a draft.
4. Review the literal scene text, narration, notes, rationale and source citations.
   Nothing appears in the storyboard until **Accept change**. New scenes can be
   edited normally afterward; **Undo acceptance** restores an unchanged addition.

Empty courses use an initial scene proposal without an anchor. Once a course has
scenes, additions require an existing selected anchor and preserve original scenes.
The initial proposal cannot overwrite an author edit or an intervening revision.

The consultation workflow also supports hosted **Prepare a content draft from
this advice**, after **Agree brief and explore scene design**. It preserves the
existing review/apply step, source bindings and revision checks. Outline-topic
drafting remains explicit and can require a separate model request for each topic.

## Boundaries and operation

Hosted suggestions currently cover native content/title/summary scenes and selected
text-field changes. They do not execute specialist orchestration, public research,
media generation, publishing or approvals. Unsupported tools fail closed; they are
not silently ignored. Local adapter tool support is unchanged.

Each addition contains 1-8 scenes (consultation drafts contain at most 5 per batch).
Request another bounded section when a larger course needs more scenes. The engine
checks the actual model wrapper and schema against the configured model budget,
reserving completion/safety space. It also enforces the lower of the 1 MiB drafting
body limit and its outer HTTP limit. It never silently drops source text.

Authoring has its own durable operation store, defaulting to 128 accepted operations
per tenant and two pending operations. `PYTHIA_HOSTED_TURN_LIMIT` configures the same
numeric allowance for the separate authoring pool. Preview makes no model request;
each ordinary submitted draft makes at most one. A cancellation or interrupted
response may already have incurred provider charges. Retry is always explicit.

Requests use a separate `pythia-authoring` proof audience. The signed body binds
author, tenant, project, source revision, request identity, action and operation.
The engine rechecks current project permission/source availability before execution,
before publishing results and on reads/replays. Credentials stay server-side.
Result hashes are verified before Chimera stores pending proposals. No provider
exception text, credential or proof is retained in the operation store.

Repeated requests use the same durable operation and never dispatch the provider
again. A restart marks uncertain engine operations failed and Chimera jobs are not
automatically resubmitted. This profile requires the documented single engine worker.
Deploy Pythia first, then Chimera backend/frontend; retain rollback copies. Other
hosted profiles and the default task API gain no drafting permission.
