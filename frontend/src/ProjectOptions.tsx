import type { ProjectSummary } from "./App";

export function ProjectOptions({ projects, sceneCounts = false, recentFirst = false }: { projects: ProjectSummary[]; sceneCounts?: boolean; recentFirst?: boolean }) {
  const label = (project: ProjectSummary) => `${project.title}${sceneCounts ? ` · ${project.sceneCount} scenes` : ""}`;
  const roots = projects.filter(project => !project.parentProjectId || !projects.some(parent => parent.id === project.parentProjectId))
    .sort((left, right) => recentFirst ? right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title) : left.title.localeCompare(right.title));
  return <>{roots.map(root => {
    const children = projects.filter(project => project.parentProjectId === root.id)
      .sort((left, right) => (left.siblingOrder ?? 0) - (right.siblingOrder ?? 0) || left.id.localeCompare(right.id));
    return children.length ? <optgroup key={root.id} label={root.title}>
      <option value={root.id}>{label(root)}</option>
      {children.map(child => <option key={child.id} value={child.id}>Subproject: {label(child)}</option>)}
    </optgroup> : <option key={root.id} value={root.id}>{label(root)}{root.parentProjectId ? " · Subproject" : ""}</option>;
  })}</>;
}
