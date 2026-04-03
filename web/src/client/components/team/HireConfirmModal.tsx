import { DEPARTMENT_INFO, type Role } from '../../lib/team-types';

interface HireConfirmModalProps {
  role: Role;
  onConfirm: () => void;
  onCancel: () => void;
}

export function HireConfirmModal({ role, onConfirm, onCancel }: HireConfirmModalProps) {
  const dept = DEPARTMENT_INFO[role.department];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3F1FC]">
            <span className="text-2xl leading-none">{role.icon}</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Hire {role.name}?</h2>
            <span
              className="text-xs font-medium"
              style={{ color: dept.color }}
            >
              {role.departmentLabel}
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="mb-4 text-sm leading-relaxed text-gray-600">
          {role.description}
        </p>

        {/* Skills */}
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
            Skills
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {role.skills.map((skill) => (
              <span
                key={skill}
                className="rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: dept.bgColor, color: dept.color }}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        {/* Hours estimate */}
        <div className="mb-6 rounded-lg bg-[#FAF9FE] px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Estimated hours</span>
            <span className="text-sm font-semibold text-gray-900">
              ~{role.estimatedHours} hrs/month
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-[#4F3588] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5A3C9E]"
          >
            Confirm Hire
          </button>
        </div>
      </div>
    </div>
  );
}
