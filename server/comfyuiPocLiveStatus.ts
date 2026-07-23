const TASK_TTL_MS = 12 * 60 * 1000;
const MAX_EVENTS = 24;

export type ComfyUiPocLivePhase = "connecting" | "queued" | "executing" | "completed" | "failed" | "unavailable";

export type ComfyUiPocLiveEvent = {
  id: number;
  label: string;
  at: number;
};

export type ComfyUiPocLiveStatus = {
  phase: ComfyUiPocLivePhase;
  label: string;
  progressValue: number | null;
  progressMax: number | null;
  percent: number | null;
  estimatedSecondsRemaining: number | null;
  queueRemaining: number | null;
  events: ComfyUiPocLiveEvent[];
  updatedAt: number;
};

type StoredTask = ComfyUiPocLiveStatus & {
  userId: number;
  expiresAt: number;
  nextEventId: number;
};

const tasks = new Map<string, StoredTask>();

function pruneExpiredTasks(now = Date.now()) {
  tasks.forEach((task, taskId) => {
    if (task.expiresAt <= now) tasks.delete(taskId);
  });
}

function appendEvent(task: StoredTask, label: string) {
  const previous = task.events.at(-1);
  if (previous?.label === label) return;
  task.events.push({ id: task.nextEventId++, label, at: Date.now() });
  if (task.events.length > MAX_EVENTS) task.events.splice(0, task.events.length - MAX_EVENTS);
}

export function createComfyUiPocLiveStatus(taskId: string, userId: number) {
  pruneExpiredTasks();
  const now = Date.now();
  const task: StoredTask = {
    userId,
    phase: "connecting",
    label: "Connecting to ComfyUI for live task progress.",
    progressValue: null,
    progressMax: null,
    percent: null,
    estimatedSecondsRemaining: null,
    queueRemaining: null,
    events: [],
    updatedAt: now,
    expiresAt: now + TASK_TTL_MS,
    nextEventId: 1,
  };
  appendEvent(task, task.label);
  tasks.set(taskId, task);
  return toPublicStatus(task);
}

export function updateComfyUiPocLiveStatus(
  taskId: string,
  userId: number,
  update: Omit<Partial<ComfyUiPocLiveStatus>, "events" | "updatedAt">,
) {
  const task = tasks.get(taskId);
  if (!task || task.userId !== userId) return null;
  const now = Date.now();
  Object.assign(task, update, { updatedAt: now, expiresAt: now + TASK_TTL_MS });
  if (update.label) appendEvent(task, update.label);
  return toPublicStatus(task);
}

export function getComfyUiPocLiveStatus(taskId: string, userId: number) {
  pruneExpiredTasks();
  const task = tasks.get(taskId);
  if (!task || task.userId !== userId) return null;
  return toPublicStatus(task);
}

function toPublicStatus(task: StoredTask): ComfyUiPocLiveStatus {
  const { userId: _userId, expiresAt: _expiresAt, nextEventId: _nextEventId, ...publicTask } = task;
  return { ...publicTask, events: [...publicTask.events] };
}
