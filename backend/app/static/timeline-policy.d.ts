import type { TimelineClip } from '../../../frontend/src/scene-timeline';
import type { Timeline } from '../../../frontend/src/scene-timeline';
import type { ClipProgress } from './scene-transport';
export function normalizeTimelineClock(timeline:Timeline,value:unknown):ClipProgress|null;
export function clipProgressKey(sceneId:string,clip:TimelineClip):string;
export function scheduledAssets(scene:any):Set<string>;
export function requiredTimelineClips(scene:any):TimelineClip[];
