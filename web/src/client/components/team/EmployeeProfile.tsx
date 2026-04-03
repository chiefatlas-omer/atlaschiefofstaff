import { useEffect, useState, useCallback } from 'react';
import {
  Employee,
  TrustLevel,
  Task,
  TaskPriority,
  JournalEntry,
  JournalEntryType,
  Soul,
  DEPARTMENT_INFO,
  TRUST_LEVEL_INFO,
  STATUS_INFO,
  TASK_PRIORITY_INFO,
  TASK_STATUS_INFO,
  JOURNAL_TYPE_INFO,
} from '../../lib/team-types';
import { teamApi } from '../../lib/team-api';

interface EmployeeProfileProps {
  employee: Employee;
  onClose: () => void;
  onUpdateTrust: (employeeId: string, level: TrustLevel) => void;
  onTogglePause: (employeeId: string) => void;
  onRemove: (employeeId: string) => void;
}

const TRUST_PROGRESSION: TrustLevel[] = [
  'supervised',
  'trusted',
  'autonomous',
];

const APPROVALS_FOR_PROMOTION: Record<TrustLevel, number | null> = {
  supervised: 15,
  trusted: 30,
  autonomous: null, // already at max
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
      {children}
    </h3>
  );
}

export default function EmployeeProfile({
  employee,
  onClose,
  onUpdateTrust,
  onTogglePause,
  onRemove,
}: EmployeeProfileProps) {
  const [visible, setVisible] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
  const [submittingTask, setSubmittingTask] = useState(false);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [journalFilter, setJournalFilter] = useState<JournalEntryType | 'all'>('all');
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [journalTitle, setJournalTitle] = useState('');
  const [journalContent, setJournalContent] = useState('');
  const [journalType, setJournalType] = useState<JournalEntryType>('work_log');
  const [submittingJournal, setSubmittingJournal] = useState(false);
  const [editingSoul, setEditingSoul] = useState(false);
  const [soulDraft, setSoulDraft] = useState<Soul | null>(null);
  const [savingSoul, setSavingSoul] = useState(false);

  const loadTasks = useCallback(async () => {
    try {
      const data = await teamApi.tasks(employee.id);
      setTasks(data);
    } catch {
      // silently fail — tasks are optional
    }
  }, [employee.id]);

  const loadJournal = useCallback(async () => {
    try {
      const type = journalFilter === 'all' ? undefined : journalFilter;
      const data = await teamApi.journal(employee.id, type);
      setJournal(data);
    } catch {
      // silently fail
    }
  }, [employee.id, journalFilter]);

  // Animate in on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Re-trigger animation when employee changes + load tasks/journal
  useEffect(() => {
    setVisible(false);
    const frame = requestAnimationFrame(() => setVisible(true));
    setShowTaskForm(false);
    setTaskTitle('');
    setShowJournalForm(false);
    setEditingSoul(false);
    loadTasks();
    loadJournal();
    return () => cancelAnimationFrame(frame);
  }, [employee.id, loadTasks, loadJournal]);

  async function handleAssignTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim() || submittingTask) return;
    setSubmittingTask(true);
    try {
      const task = await teamApi.createTask(employee.id, {
        title: taskTitle.trim(),
        priority: taskPriority,
      });
      setTasks((prev) => [task, ...prev]);
      setTaskTitle('');
      setTaskPriority('medium');
      setShowTaskForm(false);
    } catch {
      // keep form open on error
    } finally {
      setSubmittingTask(false);
    }
  }

  async function handleAddJournal(e: React.FormEvent) {
    e.preventDefault();
    if (!journalTitle.trim() || submittingJournal) return;
    setSubmittingJournal(true);
    try {
      const entry = await teamApi.createJournalEntry(employee.id, {
        date: new Date().toISOString().split('T')[0],
        type: journalType,
        title: journalTitle.trim(),
        content: journalContent.trim(),
      });
      setJournal((prev) => [entry, ...prev]);
      setJournalTitle('');
      setJournalContent('');
      setShowJournalForm(false);
    } catch {
      // keep form open
    } finally {
      setSubmittingJournal(false);
    }
  }

  async function handleSaveSoul() {
    if (!soulDraft || savingSoul) return;
    setSavingSoul(true);
    try {
      await teamApi.updateEmployee(employee.id, { soul: soulDraft } as Partial<Employee>);
      employee.soul = soulDraft;
      setEditingSoul(false);
    } catch {
      // keep editing
    } finally {
      setSavingSoul(false);
    }
  }

  const filteredJournal = journalFilter === 'all'
    ? journal
    : journal.filter((j) => j.type === journalFilter);

  const status = STATUS_INFO[employee.status];
  const trust = TRUST_LEVEL_INFO[employee.trustLevel];
  const dept = DEPARTMENT_INFO[employee.department];

  const currentTrustIndex = TRUST_PROGRESSION.indexOf(employee.trustLevel);
  const nextTrust =
    currentTrustIndex < TRUST_PROGRESSION.length - 1
      ? TRUST_PROGRESSION[currentTrustIndex + 1]
      : null;
  const approvalsNeeded = APPROVALS_FOR_PROMOTION[employee.trustLevel];

  const approvalRate =
    employee.deliverablesCount > 0
      ? Math.round(
          (employee.approvalsCount / employee.deliverablesCount) * 100
        )
      : 0;

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  function handlePromote() {
    if (nextTrust) {
      onUpdateTrust(employee.id, nextTrust);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/10 transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-[400px] flex-col bg-white shadow-xl transition-transform duration-200 ease-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex items-start gap-4 border-b border-gray-100 px-6 py-5">
            <span className="text-4xl leading-none">{employee.icon}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">
                  {employee.name}
                </h2>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: status.color }}
                  title={status.label}
                />
              </div>
              <p className="text-sm text-gray-500">{employee.role}</p>
              <span
                className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ color: dept.color, backgroundColor: dept.bgColor }}
              >
                {dept.label}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          {/* Trust Level */}
          <div className="border-b border-gray-100 px-6 py-5">
            <SectionLabel>Trust Level</SectionLabel>
            <div className="flex items-center gap-3">
              <span
                className="rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ color: trust.color, backgroundColor: trust.bgColor }}
              >
                {trust.label}
              </span>
              <span className="text-sm text-gray-500">
                {trust.description}
              </span>
            </div>

            {nextTrust && approvalsNeeded !== null && (
              <div className="mt-3">
                {/* Progress toward next level */}
                <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {employee.approvalsCount} of {approvalsNeeded} approvals
                    for{' '}
                    <span
                      className="font-medium"
                      style={{
                        color: TRUST_LEVEL_INFO[nextTrust].color,
                      }}
                    >
                      {TRUST_LEVEL_INFO[nextTrust].label}
                    </span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        (employee.approvalsCount / approvalsNeeded) * 100,
                        100
                      )}%`,
                      backgroundColor: TRUST_LEVEL_INFO[nextTrust].color,
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handlePromote}
                  className="mt-3 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
                >
                  Promote to {TRUST_LEVEL_INFO[nextTrust].label}
                </button>
              </div>
            )}
          </div>

          {/* Performance */}
          <div className="border-b border-gray-100 px-6 py-5">
            <SectionLabel>Performance</SectionLabel>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-center">
                <div className="text-lg font-semibold text-gray-900">
                  {approvalRate}%
                </div>
                <div className="text-xs text-gray-500">Approval Rate</div>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-center">
                <div className="text-lg font-semibold text-gray-900">
                  {employee.deliverablesCount}
                </div>
                <div className="text-xs text-gray-500">Deliverables</div>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-center">
                <div className="text-lg font-semibold text-gray-900">
                  {employee.hoursUsed}
                  <span className="text-sm font-normal text-gray-400">
                    /{employee.hoursAllocated}
                  </span>
                </div>
                <div className="text-xs text-gray-500">Hours</div>
              </div>
            </div>
          </div>

          {/* Assignments */}
          {!employee.isChiefOfStaff && employee.id !== 'owner' && (
            <div className="border-b border-gray-100 px-6 py-5">
              <div className="mb-2 flex items-center justify-between">
                <SectionLabel>Assignments</SectionLabel>
                <button
                  type="button"
                  onClick={() => setShowTaskForm(!showTaskForm)}
                  className="rounded-md bg-[#4F3588] px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-[#5A3C9E]"
                >
                  {showTaskForm ? 'Cancel' : '+ Assign Task'}
                </button>
              </div>

              {showTaskForm && (
                <form onSubmit={handleAssignTask} className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <input
                    type="text"
                    placeholder="What needs to be done?"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    className="mb-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                      className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-[#4F3588]"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                    <button
                      type="submit"
                      disabled={!taskTitle.trim() || submittingTask}
                      className="ml-auto rounded-md bg-[#4F3588] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#5A3C9E] disabled:opacity-50"
                    >
                      {submittingTask ? 'Assigning…' : 'Assign'}
                    </button>
                  </div>
                </form>
              )}

              {tasks.length > 0 ? (
                <div className="space-y-2">
                  {tasks.map((task) => {
                    const priority = TASK_PRIORITY_INFO[task.priority];
                    const status = TASK_STATUS_INFO[task.status];
                    return (
                      <div
                        key={task.id}
                        className="flex items-start gap-2.5 rounded-lg border border-gray-100 bg-white px-3 py-2.5"
                      >
                        <span
                          className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: status.color }}
                          title={status.label}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 leading-snug">
                            {task.title}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                              style={{ color: priority.color, backgroundColor: priority.bgColor }}
                            >
                              {priority.label}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {status.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : !showTaskForm ? (
                <p className="text-sm text-gray-400">
                  No tasks assigned yet
                </p>
              ) : null}
            </div>
          )}

          {/* Skills */}
          <div className="border-b border-gray-100 px-6 py-5">
            <SectionLabel>Skills</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {employee.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    color: dept.color,
                    backgroundColor: dept.bgColor,
                  }}
                >
                  {skill}
                </span>
              ))}
              {employee.skills.length === 0 && (
                <span className="text-xs text-gray-400">
                  No skills configured
                </span>
              )}
            </div>
          </div>

          {/* Personality (Soul) */}
          {employee.id !== 'owner' && (
            <div className="border-b border-gray-100 px-6 py-5">
              <div className="mb-2 flex items-center justify-between">
                <SectionLabel>Personality</SectionLabel>
                {employee.soul && !editingSoul && (
                  <button
                    type="button"
                    onClick={() => { setEditingSoul(true); setSoulDraft({ ...employee.soul! }); }}
                    className="text-xs font-medium text-[#4F3588] hover:text-[#5A3C9E]"
                  >
                    Edit
                  </button>
                )}
              </div>

              {!employee.soul && !editingSoul ? (
                <p className="text-sm text-gray-400">No personality profile configured</p>
              ) : editingSoul && soulDraft ? (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Personality</label>
                    <textarea
                      value={soulDraft.personality}
                      onChange={(e) => setSoulDraft({ ...soulDraft, personality: e.target.value })}
                      rows={2}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Working Style</label>
                    <textarea
                      value={soulDraft.workingStyle}
                      onChange={(e) => setSoulDraft({ ...soulDraft, workingStyle: e.target.value })}
                      rows={2}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Decision Framework</label>
                    <textarea
                      value={soulDraft.decisionFramework}
                      onChange={(e) => setSoulDraft({ ...soulDraft, decisionFramework: e.target.value })}
                      rows={2}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveSoul}
                      disabled={savingSoul}
                      className="rounded-md bg-[#4F3588] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#5A3C9E] disabled:opacity-50"
                    >
                      {savingSoul ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSoul(false)}
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : employee.soul ? (
                <div className="space-y-3">
                  <div className="rounded-lg bg-gray-50 px-4 py-3">
                    <p className="text-sm leading-relaxed text-gray-600">{employee.soul.personality}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500">Working Style</span>
                    <p className="mt-0.5 text-sm text-gray-600">{employee.soul.workingStyle}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500">Decision Framework</span>
                    <p className="mt-0.5 text-sm text-gray-600">{employee.soul.decisionFramework}</p>
                  </div>
                  {employee.soul.strengths.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-500">Strengths</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {employee.soul.strengths.map((s) => (
                          <span key={s} className="rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-xs font-medium text-[#22C55E]">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {employee.soul.growthAreas.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-500">Growth Areas</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {employee.soul.growthAreas.map((g) => (
                          <span key={g} className="rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-medium text-[#F59E0B]">{g}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Journal */}
          {employee.id !== 'owner' && (
            <div className="border-b border-gray-100 px-6 py-5">
              <div className="mb-2 flex items-center justify-between">
                <SectionLabel>Journal</SectionLabel>
                <button
                  type="button"
                  onClick={() => setShowJournalForm(!showJournalForm)}
                  className="rounded-md bg-[#4F3588] px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-[#5A3C9E]"
                >
                  {showJournalForm ? 'Cancel' : '+ Add Entry'}
                </button>
              </div>

              {/* Journal type filter */}
              <div className="mb-3 flex flex-wrap gap-1">
                {(['all', 'work_log', 'learning', 'failure', 'insight'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setJournalFilter(t)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                      journalFilter === t
                        ? 'bg-[#4F3588] text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {t === 'all' ? 'All' : JOURNAL_TYPE_INFO[t].icon + ' ' + JOURNAL_TYPE_INFO[t].label}
                  </button>
                ))}
              </div>

              {showJournalForm && (
                <form onSubmit={handleAddJournal} className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                  <select
                    value={journalType}
                    onChange={(e) => setJournalType(e.target.value as JournalEntryType)}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-[#4F3588]"
                  >
                    {(Object.keys(JOURNAL_TYPE_INFO) as JournalEntryType[]).map((t) => (
                      <option key={t} value={t}>{JOURNAL_TYPE_INFO[t].icon} {JOURNAL_TYPE_INFO[t].label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Title"
                    value={journalTitle}
                    onChange={(e) => setJournalTitle(e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]"
                    autoFocus
                  />
                  <textarea
                    placeholder="Details (optional)"
                    value={journalContent}
                    onChange={(e) => setJournalContent(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]"
                  />
                  <button
                    type="submit"
                    disabled={!journalTitle.trim() || submittingJournal}
                    className="rounded-md bg-[#4F3588] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#5A3C9E] disabled:opacity-50"
                  >
                    {submittingJournal ? 'Adding...' : 'Add Entry'}
                  </button>
                </form>
              )}

              {filteredJournal.length > 0 ? (
                <div className="space-y-2">
                  {filteredJournal.slice(0, 10).map((entry) => {
                    const typeInfo = JOURNAL_TYPE_INFO[entry.type];
                    return (
                      <div key={entry.id} className="rounded-lg border border-gray-100 bg-white px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ color: typeInfo.color, backgroundColor: typeInfo.bgColor }}
                          >
                            {typeInfo.icon} {typeInfo.label}
                          </span>
                          <span className="text-[10px] text-gray-400">{entry.date}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-gray-900 leading-snug">{entry.title}</p>
                        {entry.content && (
                          <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{entry.content}</p>
                        )}
                        {entry.tags.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {entry.tags.map((tag) => (
                              <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : !showJournalForm ? (
                <p className="text-sm text-gray-400">No journal entries yet</p>
              ) : null}
            </div>
          )}

          {/* Standing Instructions */}
          <div className="border-b border-gray-100 px-6 py-5">
            <SectionLabel>Standing Instructions</SectionLabel>
            {employee.standingInstructions ? (
              <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-600">
                {employee.standingInstructions}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                No standing instructions set
              </p>
            )}
          </div>

          {/* Training Materials */}
          <div className="border-b border-gray-100 px-6 py-5">
            <SectionLabel>Training Materials</SectionLabel>
            {employee.trainingMaterials.length > 0 ? (
              <ul className="space-y-1.5">
                {employee.trainingMaterials.map((file) => (
                  <li key={file} className="flex items-center gap-2 text-sm">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      className="shrink-0 text-gray-400"
                    >
                      <path
                        d="M4 1h5.586a1 1 0 0 1 .707.293l2.414 2.414A1 1 0 0 1 13 4.414V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                      <path
                        d="M5 8h6M5 10.5h4"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-gray-600">{file}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">
                No training materials uploaded
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="px-6 py-5">
            <SectionLabel>Actions</SectionLabel>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onTogglePause(employee.id)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  employee.status === 'paused'
                    ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {employee.status === 'paused'
                  ? 'Resume Employee'
                  : 'Pause Employee'}
              </button>
              <button
                type="button"
                onClick={() => onRemove(employee.id)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
              >
                Remove from Team
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
