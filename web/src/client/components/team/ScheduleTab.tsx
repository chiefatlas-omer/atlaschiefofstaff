import { useMemo, useState } from 'react';
import { DEPARTMENT_INFO, type Employee, type Routine } from '../../lib/team-types';

interface ScheduleTabProps {
  routines: Routine[];
  employees: Employee[];
  onAddRoutine: (routine: Omit<Routine, 'id'>) => void;
  onToggleRoutine: (routineId: string) => void;
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};
const HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 7am-6pm

function getCurrentDay(): string {
  return DAYS[((new Date().getDay() + 6) % 7)]; // JS Sunday=0 -> mon-indexed
}

const EMPTY_FORM = {
  employeeId: '',
  name: '',
  description: '',
  days: [] as string[],
  time: '09:00',
  enabled: true,
};

export function ScheduleTab({ routines, employees, onAddRoutine, onToggleRoutine }: ScheduleTabProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const currentDay = getCurrentDay();

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);

  const filteredRoutines = useMemo(() => {
    if (!selectedEmployee) return routines;
    return routines.filter((r) => r.employeeId === selectedEmployee);
  }, [routines, selectedEmployee]);

  // Build a lookup: day -> hour -> routines[]
  const grid = useMemo(() => {
    const map = new Map<string, Routine[]>();
    for (const r of filteredRoutines) {
      const hour = parseInt(r.time.split(':')[0], 10);
      for (const day of r.days) {
        const key = `${day}-${hour}`;
        const arr = map.get(key) ?? [];
        arr.push(r);
        map.set(key, arr);
      }
    }
    return map;
  }, [filteredRoutines]);

  function handleSubmit() {
    if (!form.employeeId || !form.name || form.days.length === 0) return;
    onAddRoutine(form);
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  function toggleDay(day: string) {
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        {/* Employee selector */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedEmployee(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedEmployee === null
                ? 'bg-[#4F3588] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All Employees
          </button>
          {employees.map((emp) => (
            <button
              key={emp.id}
              onClick={() => setSelectedEmployee(emp.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedEmployee === emp.id
                  ? 'bg-[#4F3588] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className="mr-1">{emp.icon}</span>
              {emp.name}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-[#4F3588] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#5A3C9E]"
        >
          {showForm ? 'Cancel' : 'Add Routine'}
        </button>
      </div>

      {/* Add Routine Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h4 className="mb-4 text-sm font-semibold text-gray-900">New Routine</h4>
          <div className="grid grid-cols-2 gap-4">
            {/* Employee */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Employee</label>
              <select
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]"
              >
                <option value="">Select...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.icon} {emp.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Name */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Routine Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Daily social post"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]"
              />
            </div>

            {/* Time */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Time</label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]"
              />
            </div>

            {/* Days */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Days</label>
              <div className="flex gap-1.5">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      form.days.includes(day)
                        ? 'bg-[#4F3588] text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {DAY_LABELS[day]}
                  </button>
                ))}
              </div>
            </div>

            {/* Description - full width */}
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="What should this routine accomplish?"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              className="rounded-lg px-4 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!form.employeeId || !form.name || form.days.length === 0}
              className="rounded-lg bg-[#4F3588] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#5A3C9E] disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Weekly Calendar Grid */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div className="grid min-w-[700px] grid-cols-[60px_repeat(7,1fr)]">
          {/* Header row */}
          <div className="border-b border-gray-100 p-2" />
          {DAYS.map((day) => (
            <div
              key={day}
              className={`border-b border-l border-gray-100 p-2 text-center text-xs font-semibold uppercase tracking-wider ${
                day === currentDay ? 'bg-[#FAF9FE] text-[#4F3588]' : 'text-gray-400'
              }`}
            >
              {DAY_LABELS[day]}
            </div>
          ))}

          {/* Time rows */}
          {HOURS.map((hour) => (
            <>
              {/* Time label */}
              <div
                key={`label-${hour}`}
                className="flex items-start justify-end border-b border-gray-50 pr-2 pt-1 text-[10px] text-gray-400"
              >
                {hour <= 12 ? hour : hour - 12}{hour < 12 ? 'am' : 'pm'}
              </div>

              {/* Day cells */}
              {DAYS.map((day) => {
                const cellRoutines = grid.get(`${day}-${hour}`) ?? [];
                const isToday = day === currentDay;
                return (
                  <div
                    key={`${day}-${hour}`}
                    className={`min-h-[44px] border-b border-l border-gray-50 p-0.5 ${
                      isToday ? 'bg-[#FAF9FE]/50' : ''
                    }`}
                  >
                    {cellRoutines.map((routine) => {
                      const emp = employeeMap.get(routine.employeeId);
                      const dept = emp ? DEPARTMENT_INFO[emp.department] : null;
                      return (
                        <button
                          key={routine.id}
                          onClick={() => onToggleRoutine(routine.id)}
                          className={`mb-0.5 w-full rounded px-1.5 py-1 text-left transition-opacity ${
                            routine.enabled ? 'opacity-100' : 'opacity-40'
                          }`}
                          style={{
                            backgroundColor: dept?.bgColor ?? '#F3F4F6',
                            color: dept?.color ?? '#6B7280',
                          }}
                          title={routine.enabled ? 'Click to disable' : 'Click to enable'}
                        >
                          <span
                            className={`block text-[10px] font-medium leading-tight ${
                              !routine.enabled ? 'line-through' : ''
                            }`}
                          >
                            {routine.name}
                          </span>
                          {!selectedEmployee && emp && (
                            <span className="block text-[9px] opacity-70">{emp.icon} {emp.name}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
