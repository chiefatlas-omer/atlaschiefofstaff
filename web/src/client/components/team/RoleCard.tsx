import { DEPARTMENT_INFO, type Role } from '../../lib/team-types';

interface RoleCardProps {
  role: Role;
  isHired: boolean;
  onHire: (role: Role) => void;
}

const DEPARTMENT_GRADIENT: Record<string, string> = {
  sales_marketing: 'from-[#4F3588]/20 to-[#A78BFA]/20',
  operations: 'from-[#EA580C]/20 to-[#FB923C]/20',
  customer_service: 'from-[#16A34A]/20 to-[#4ADE80]/20',
};

export function RoleCard({ role, isHired, onHire }: RoleCardProps) {
  const dept = DEPARTMENT_INFO[role.department];
  const gradient = DEPARTMENT_GRADIENT[role.department] ?? 'from-gray-100 to-gray-200';

  return (
    <div className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-[#A78BFA] hover:shadow-md">
      {/* Header */}
      <div className="mb-3 flex items-start gap-3">
        <div
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient}`}
        >
          <span className="text-xl leading-none">{role.icon}</span>
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-gray-900">{role.name}</h3>
          <span
            className="text-xs font-medium"
            style={{ color: dept.color }}
          >
            {role.departmentLabel}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-gray-600">
        {role.description}
      </p>

      {/* Skills */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {role.skills.map((skill) => (
          <span
            key={skill}
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: dept.bgColor, color: dept.color }}
          >
            {skill}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between">
        <span className="text-xs text-gray-400">~{role.estimatedHours} hrs/month</span>

        {isHired ? (
          <span className="rounded-full bg-[#DCFCE7] px-3 py-1.5 text-xs font-medium text-[#16A34A]">
            On Team
          </span>
        ) : (
          <button
            onClick={() => onHire(role)}
            className="rounded-lg bg-[#4F3588] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#5A3C9E]"
          >
            Hire
          </button>
        )}
      </div>
    </div>
  );
}
