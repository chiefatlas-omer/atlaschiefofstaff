import {
  Employee,
  Department,
  DEPARTMENT_INFO,
  TRUST_LEVEL_INFO,
  STATUS_INFO,
} from '../../lib/team-types';

interface OrgChartProps {
  employees: Employee[];
  onSelectEmployee: (id: string) => void;
  selectedEmployeeId: string | null;
}

// The "owner" is a virtual node representing the business owner
const OWNER_NODE = {
  id: '__owner__',
  name: 'You',
  role: 'Business Owner',
  icon: '👤',
};

function NodeCard({
  employee,
  isSelected,
  isOwner,
  onClick,
}: {
  employee: Employee | null;
  isSelected: boolean;
  isOwner: boolean;
  onClick?: () => void;
}) {
  if (isOwner) {
    return (
      <div className="flex flex-col items-center">
        <div
          className="relative flex flex-col items-center gap-1 rounded-xl border-2 border-amber-300 bg-white px-5 py-3 shadow-sm"
          style={{ minWidth: 140 }}
        >
          <span className="text-3xl leading-none">{OWNER_NODE.icon}</span>
          <span className="text-sm font-semibold text-gray-900">
            {OWNER_NODE.name}
          </span>
          <span className="text-xs text-gray-500">{OWNER_NODE.role}</span>
        </div>
      </div>
    );
  }

  if (!employee) return null;

  const status = STATUS_INFO[employee.status];
  const trust = TRUST_LEVEL_INFO[employee.trustLevel];

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onClick}
        className={`relative flex flex-col items-center gap-1 rounded-xl border bg-white px-4 py-3 transition-all hover:border-gray-300 hover:shadow-md ${
          isSelected
            ? 'border-[#4F3588] shadow-md ring-1 ring-[#4F3588]/20'
            : 'border-gray-200 shadow-sm'
        }`}
        style={{ minWidth: 130 }}
      >
        {/* Status dot */}
        <span
          className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full"
          style={{ backgroundColor: status.color }}
          title={status.label}
        />

        <span className="text-2xl leading-none">{employee.icon}</span>
        <span className="text-sm font-medium text-gray-900">
          {employee.name}
        </span>
        <span className="max-w-[120px] truncate text-xs text-gray-500">
          {employee.role}
        </span>

        {/* Bottom row: hours + trust */}
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {employee.hoursUsed}/{employee.hoursAllocated} hrs
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
            style={{ color: trust.color, backgroundColor: trust.bgColor }}
          >
            {trust.label}
          </span>
        </div>
      </button>
    </div>
  );
}

function ConnectorVertical({ height = 28 }: { height?: number }) {
  return (
    <div className="flex justify-center">
      <div
        className="w-px bg-gray-200"
        style={{ height }}
      />
    </div>
  );
}

function DepartmentGroup({
  department,
  employees,
  selectedEmployeeId,
  onSelectEmployee,
}: {
  department: Department;
  employees: Employee[];
  selectedEmployeeId: string | null;
  onSelectEmployee: (id: string) => void;
}) {
  const info = DEPARTMENT_INFO[department];

  return (
    <div className="flex flex-col items-center">
      {/* Department label */}
      <span
        className="mb-2 rounded-full px-3 py-1 text-xs font-medium"
        style={{ color: info.color, backgroundColor: info.bgColor }}
      >
        {info.label}
      </span>

      {/* Horizontal connector above employee nodes */}
      {employees.length > 1 && (
        <div className="relative mb-0 flex items-start justify-center">
          <div
            className="h-px bg-gray-200"
            style={{ width: `${(employees.length - 1) * 152}px` }}
          />
        </div>
      )}

      {/* Employee nodes */}
      <div className="flex gap-4">
        {employees.length === 0 ? (
          <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-gray-200 px-6 text-xs text-gray-400">
            No employees yet
          </div>
        ) : (
          employees.map((emp) => (
            <div key={emp.id} className="flex flex-col items-center">
              {/* Short vertical connector from horizontal line to node */}
              <ConnectorVertical height={16} />
              <NodeCard
                employee={emp}
                isSelected={selectedEmployeeId === emp.id}
                isOwner={false}
                onClick={() => onSelectEmployee(emp.id)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function OrgChart({
  employees,
  onSelectEmployee,
  selectedEmployeeId,
}: OrgChartProps) {
  const chiefOfStaff = employees.find((e) => e.isChiefOfStaff);
  const regularEmployees = employees.filter(
    (e) => !e.isChiefOfStaff && e.reportsTo !== null
  );

  // Group employees by department
  const departments: Department[] = [
    'sales_marketing',
    'operations',
    'customer_service',
  ];
  const grouped = departments.reduce(
    (acc, dept) => {
      acc[dept] = regularEmployees.filter((e) => e.department === dept);
      return acc;
    },
    {} as Record<Department, Employee[]>
  );

  // Filter to only departments that have employees or always show all three
  const activeDepartments = departments.filter(
    (d) => grouped[d].length > 0
  );

  return (
    <div className="flex flex-col items-center py-6">
      {/* Owner node */}
      <NodeCard employee={null} isSelected={false} isOwner />

      {/* Connector: Owner -> CoS */}
      <ConnectorVertical />

      {/* Chief of Staff node */}
      {chiefOfStaff ? (
        <NodeCard
          employee={chiefOfStaff}
          isSelected={selectedEmployeeId === chiefOfStaff.id}
          isOwner={false}
          onClick={() => onSelectEmployee(chiefOfStaff.id)}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 px-5 py-3 text-sm text-gray-400">
          Chief of Staff
        </div>
      )}

      {/* Connector: CoS -> departments */}
      <ConnectorVertical />

      {/* Horizontal line spanning all departments */}
      {activeDepartments.length > 1 && (
        <div className="flex justify-center">
          <div
            className="h-px bg-gray-200"
            style={{
              width: `${(activeDepartments.length - 1) * 260}px`,
            }}
          />
        </div>
      )}

      {/* Department groups */}
      <div className="flex items-start gap-8">
        {activeDepartments.map((dept) => (
          <div key={dept} className="flex flex-col items-center">
            <ConnectorVertical height={16} />
            <DepartmentGroup
              department={dept}
              employees={grouped[dept]}
              selectedEmployeeId={selectedEmployeeId}
              onSelectEmployee={onSelectEmployee}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
