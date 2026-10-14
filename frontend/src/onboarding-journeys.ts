import type { Context, Journey } from '@guided-workflows/onboarding';
import { firstSceneJourney } from './onboarding';

export function reportOnboardingOutcome(type: string, scope: string, entityId?: string) {
  window.dispatchEvent(new CustomEvent('chimera:onboarding-outcome', { detail: { type, scope, entityId } }));
}
const project = (c: Context) => Boolean(c.projectId);
const scene = (c: Context) => project(c) && Number(c.sceneCount) > 0;
const assessment = (c: Context) => Boolean(c.assessmentSceneId);
const always = () => true;
type Task = [string, string, string, string, string?, ((c: Context) => boolean)?];
const tasks: Task[] = [
  ['workspace', 'Choose a project', 'workspace.project', 'Use the project selector to open a course. Walkthrough progress is separate for each project. Check the selected course, then Next.', undefined, always],
  ['import-deck', 'Import PowerPoint', 'storyboard.import', 'Choose a readable PPTX with Import PowerPoint. Slides become scenes with text and speaker notes. Previews require LibreOffice. Wait for the import to finish.', 'deck.imported'],
  ['edit-scene', 'Edit scene content and settings', 'scene.edit', 'Review title, on-screen text, action description, speaker notes, scene type, rendering mode and required status in Details. Choose Save scene.', 'scene.updated', scene],
  ['order-scenes', 'Reorder scenes', 'storyboard.list', 'Use a scene’s up/down arrows or drag grip. Wait for the new order to save. You need at least two scenes.', 'scene.reordered', c => Number(c.sceneCount) > 1],
  ['delete-scene', 'Delete a scene', 'storyboard.list', 'Practice only on expendable content. The trash button opens a confirmation; deletion can clear remediation links. Cancel keeps the scene. Skip if you do not want to delete.', 'scene.deleted', scene],
  ['upload-media', 'Upload images or audio', 'media.library', 'Choose Add media and a supported image or audio file. The file is added to the selected project library; attachment is a separate action.', 'media.uploaded'],
  ['attach-media', 'Attach or detach media', 'media.library', 'Select the intended scene in Storyboard before starting. Choose Attach to scene or Detach media on an asset and wait for the save.', 'media.assigned', c => scene(c) && Number(c.assetCount) > 0],
  ['media-credit', 'Save media attribution', 'media.library', 'Enter the source/license credit, choose Draft or Complete, and Save credit. Complete attribution requires text.', 'media.credit-saved', c => Number(c.assetCount) > 0],
  ['audio-rules', 'Require audio playback', 'scene.audio', 'Change Require attached audio to finish. Learners must play every attached track to the end. Wait for the setting to save.', 'audio.rules-saved', c => Boolean(c.hasAudio)],
  ['accessibility', 'Describe scene images', 'review.accessibility', 'Write alt text conveying the image’s information or mark it decorative. Save descriptions for a scene. Review all attached images before release.', 'image.described', c => Boolean(c.hasImages)],
  ['upload-template', 'Upload a scene template', 'templates.library', 'Choose Upload PPTX template and a readable presentation. Wait for the reusable template to appear in the library.', 'template.uploaded', always],
  ['edit-template', 'Edit template details', 'templates.edit', 'Edit the template name and description, then Save template.', 'template.saved', c => Number(c.templateCount) > 0],
  ['replace-template', 'Replace a template source', 'templates.library', 'Use Replace PPTX on the intended template and select its replacement. Existing scene references keep the template ID.', 'template.replaced', c => Number(c.templateCount) > 0],
  ['use-template', 'Assign a template to a scene', 'scene.edit', 'In Details, set Rendering mode to Template and choose a template, then choose Save scene. The other modes are Fidelity, Hybrid and Native.', 'scene.template-saved', c => scene(c) && Number(c.templateCount) > 0],
  ...([
    ['single-choice', 'Single-choice question', 'Enter at least two choices and select the one correct answer.'],
    ['multiple-response', 'Multiple-answer question', 'Enter choices and select every correct answer.'],
    ['true-false', 'True / false question', 'Select True or False as the correct answer.'],
    ['ordering', 'Ordering question', 'Enter items and use the arrows to put them in correct order.'],
    ['drag-drop', 'Drag-and-drop question', 'Enter draggable items and drop targets and specify correct placement.'],
    ['matching', 'Matching question', 'Enter both columns and specify each correct match.'],
    ['short-answer', 'Short-answer question', 'Enter accepted answers, one per line, and choose whether letter case matters.'],
  ].map(([type, title, copy]) => [`question-${type}`, title, 'assessment.editor', `Choose the corresponding Question type and enter a clear prompt. ${copy} Review feedback and assessment rules, then Save question.`, `question.saved.${type}`, assessment] as Task)),
  ['question-rules', 'Assessment attempts and remediation', 'assessment.editor', 'Review Maximum attempts, Passing score, Course score weight and Remediation scene. Save question. Test retry/remediation in learner preview afterwards.', 'question.saved', assessment],
  ['remove-question', 'Remove an assessment question', 'assessment.editor', 'Remove question clears the authored item after the application confirmation. Use expendable content or skip this step.', 'question.removed', assessment],
  ['preview', 'Preview as a learner', 'preview.content', 'Navigate scenes, inspect text and media, try questions and retry/remediation, and check required visits/audio progress. Preview progress resumes in this browser. Choose Next after review.', undefined, scene],
  ['comments', 'Post a review comment', 'preview.comments', 'Enter Reviewer and a scene-specific Comment, then Add comment. Comments refer to scene revisions and can become outdated after edits.', 'comment.saved', scene],
  ['comment-review', 'Reply, resolve and reopen comments', 'preview.comments', 'Reply adds discussion; Resolve closes an issue and Reopen returns it to review. Perform a reply or decision. Request enhancement invokes the configured provider only when you explicitly choose it.', 'comment.updated', scene],
  ['completion', 'Set course completion rules', 'review.completion', 'Choose the passing score and whether optional questions count, then Save rules. Required scene visits and required audio also affect completion.', 'completion.saved'],
  ['validation', 'Validate authoring and production readiness', 'review.validation', 'Wait for the report to load. Review Authoring, then switch to Production release. Follow scene findings to their editor. Walkthrough completion does not mean validation passed.', 'validation.loaded'],
  ['references', 'Add enhancement references', 'review.enhancement', 'Use Add reference to upload PDF, DOCX, PPTX, text or Markdown. Review extraction warnings and select resources for the run.', 'reference.uploaded'],
  ['enhancement', 'Preview and submit an enhancement run', 'review.enhancement', 'Choose scope, scenes, goal and references. Preview submission to inspect provider availability and estimates. Submit run explicitly invokes the provider. Monitor jobs and use Cancel or Retry when appropriate.', 'enhancement.submitted'],
  ['enhancement-jobs', 'Cancel or retry enhancement jobs', 'review.enhancement', 'Inspect job status, progress and reference conflicts. Cancel a queued/running job or Retry a failed/cancelled job. Retry explicitly invokes the configured provider again. Skip if there is no applicable job.', 'enhancement.job-updated'],
  ['suggestions', 'Review and decide suggestions', 'review.enhancement', 'Compare current/proposed values and citations. Edit values, Accept change or Reject. Acceptance saves history; Undo acceptance restores prior values only if they have not changed since.', 'suggestion.decided'],
  ['generation', 'Generate and review media candidates', 'media.generated', 'Choose image or narration, purpose and prompt/script, then explicitly Generate candidate. Inspect the result before Approve asset, Reject or Regenerate. Generation never attaches media automatically.', 'candidate.decided', scene],
  ['regenerate', 'Regenerate a media candidate', 'media.generated', 'Inspect a pending candidate and choose Regenerate to explicitly request another provider run. Skip if no pending candidate is available.', 'candidate.regenerated', scene],
  ...([
    ['scorm2004', 'Build SCORM 2004', 'Choose Build SCORM 2004. Test the downloaded package in your LMS; building is not LMS qualification.'],
    ['scorm12', 'Build SCORM 1.2', 'Choose Build SCORM 1.2. Blackboard verification is documented for SCORM 2004 only.'],
    ['report', 'Download a SCORM build report', 'Build the profile first, then Report 2004 or Report 1.2. Inspect the downloaded warnings and inventory.'],
    ['json', 'Download storyboard JSON', 'Choose Download JSON. This exports data and asset references, without media binaries.'],
    ['backup', 'Download Chimera storyboard', 'Choose Download Chimera storyboard to preserve the project and media before replacement operations.'],
    ['word', 'Export an editable Word storyboard', 'Choose SME Master or Full storyboard, then Download Word document. Answer keys are authoring material and excluded by default.'],
    ['qti-test', 'Export a QTI assessment test', 'Download QTI test packages at least two authored questions. Chimera retry/pass settings are not included in item XML.'],
    ['threshold', 'Set the package size warning', 'Change Warn when a package exceeds (1–4096 MB), then leave the field to save.'],
    ['restore-json', 'Restore storyboard JSON', 'Use Restore JSON with compatible data. Referenced assets/templates must already exist. Read the replacement confirmation; the guide never confirms it. Practice in a disposable project or skip.'],
    ['restore-backup', 'Restore Chimera storyboard', 'Choose Restore Chimera storyboard and read the replacement confirmation. The archive must validate before replacement. Practice in a disposable project or skip.'],
  ].map(([id, title, copy]) => [`export-${id}`, title, 'export.panel', copy, `export.${id}`, id === 'qti-test' ? (c: Context) => Number(c.questionCount) >= 2 : project] as Task)),
  ['qti-item', 'Export a QTI question', 'assessment.editor', 'Save the question first, then Export QTI item. This exports one QTI 2.1 item. Retry/pass settings remain Chimera settings.', 'question.exported', assessment],
  ['appearance', 'Choose Light, Dark or System', 'workspace.appearance', 'Choose Light, Dark or System. The preference is remembered across tabs; System follows the device theme. Choose Next after checking it.', undefined, always],
  ['management', 'Review My Work', 'workspace.management', 'Review project health, approvals, identity/policy and recent activity. This surface shows available data and does not grant permissions. Choose Next after review.', undefined, always],
];
export const chimeraJourneys: Journey[] = [firstSceneJourney, ...tasks.map<Journey>(([id, title, target, instruction, event, prerequisite = project]) => ({
  id, title, version: 1, steps: [
    { id: `${id}-task`, title, target, instruction, event, prerequisite,
      isComplete: id === 'validation' ? c => c.validationReady === c.projectId : undefined,
      accept: target === 'assessment.editor' ? (e, c) => e.entityId === c.assessmentSceneId :
        target === 'scene.edit' || target === 'scene.audio' || id === 'attach-media' ? (e, c) => e.entityId === c.selectedSceneId : undefined,
      unavailable: 'Open a project and add the required scene, asset, question or template first. Pause to prepare it, then resume or Retry.' },
    { id: `${id}-review`, title: 'Review the result', target: id === 'validation' ? target : undefined,
      instruction: `${id === 'validation' ? 'Review the Authoring and Production release reports and follow scene findings to the editor. This does not mean the course passed validation. ' : ''}Review the result, then Next to acknowledge it. This browser’s practice history is separate from course readiness.` },
  ],
}))];
