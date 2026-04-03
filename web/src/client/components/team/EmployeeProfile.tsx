import { useEffect, useState } from 'react';
import {
  Employee,
  TrustLevel,
  DEPARTMENT_INFO,
  TRUST_LEVEL_INFO,
  STATUS_INFO,
} from '../../lib/team-types';

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

  // Animate in on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Re-trigger animation when employee changes
  useEffect(() => {
    setVisible(false);
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [employee.id]);

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
