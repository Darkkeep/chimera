import type { AssessmentItem, QuestionMetadata, Scene } from "./App";
import { QuestionReferencePicker } from "./QuestionReferencePicker";

export function QuestionMetadataFields({ item, sceneTitle, scenes, disabled, onChange }: {
  item: AssessmentItem;
  sceneTitle: string;
  scenes: Scene[];
  disabled: boolean;
  onChange: (item: AssessmentItem) => void;
}) {
  const metadata: QuestionMetadata = item.metadata ?? {
    title: "", description: "", tags: [], author: "", source: "", language: "en", difficulty: "", learningObjectiveRefs: [],
  };
  const update = (changes: Partial<QuestionMetadata>) => onChange({ ...item, metadata: { ...metadata, ...changes } });
  return <section className="question-metadata">
    <details className="question-references">
    <summary>Tags and learning-objective references</summary>
    <QuestionReferencePicker label="Tags" singular="tag" values={metadata.tags} available={scenes.flatMap(scene => scene.assessmentItem?.metadata?.tags ?? [])} disabled={disabled} onChange={tags => update({ tags })} />
    <QuestionReferencePicker label="Learning-objective references" singular="learning-objective reference" values={metadata.learningObjectiveRefs} available={scenes.flatMap(scene => scene.assessmentItem?.metadata?.learningObjectiveRefs ?? [])} disabled={disabled} onChange={learningObjectiveRefs => update({ learningObjectiveRefs })} />
    <p className="assessment-authoring-hint">Search values used by questions in this project, or create a new one. Save question to keep your selections. These references do not create or modify learning objectives. Tags and references are included in question exports, not shown to learners.</p>
    </details>
    <details>
    <summary>Question metadata</summary>
    <p className="assessment-authoring-hint">Authoring information, not shown to learners. The stable identifier is used in imports and exports; changing it changes the question's external identity.</p>
    <fieldset disabled={disabled} className="question-metadata-fields">
      <label>Question title<input maxLength={120} value={metadata.title} placeholder={sceneTitle} onChange={event => update({ title: event.target.value })} /></label>
      <label>Stable question identifier<input maxLength={64} pattern="[A-Za-z][A-Za-z0-9_-]{0,63}" value={item.identifier} onChange={event => onChange({ ...item, identifier: event.target.value })} /></label>
      <label className="question-metadata-wide">Description<textarea rows={2} maxLength={2000} value={metadata.description} onChange={event => update({ description: event.target.value })} /></label>
      <label>Author<input maxLength={200} value={metadata.author} onChange={event => update({ author: event.target.value })} /></label>
      <label>Source<input maxLength={1000} value={metadata.source} onChange={event => update({ source: event.target.value })} /></label>
      <label>Language tag<input maxLength={64} value={metadata.language} placeholder="en or en-US" onChange={event => update({ language: event.target.value })} /></label>
      <label>Difficulty<select value={metadata.difficulty} onChange={event => {
        const difficulty = event.target.value;
        if (difficulty === "" || difficulty === "easy" || difficulty === "medium" || difficulty === "hard") update({ difficulty });
      }}><option value="">Not specified</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
    </fieldset>
    </details>
  </section>;
}
