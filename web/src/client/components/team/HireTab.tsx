import { useState } from 'react';
import { DEPARTMENT_INFO, type Blueprint, type Department, type Employee, type HireCustomization, type Role } from '../../lib/team-types';
import { BlueprintCard } from './BlueprintCard';
import { RoleCard } from './RoleCard';
import { RoleDetailPanel } from './RoleDetailPanel';

interface HireTabProps {
  roles: Role[];
  blueprints: Blueprint[];
  employees: Employee[];
  onHire: (data: HireCustomization) => void;
  onImportBlueprint: (blueprint: Blueprint) => void;
}

const DEPARTMENT_FILTERS: { key: Department | null; label: string }[] = [
  { key: null, label: 'All Roles' },
  { key: 'sales_marketing', label: 'Sales & Marketing' },
  { key: 'operations', label: 'Operations' },
  { key: 'customer_service', label: 'Customer Service' },
];

export function HireTab({ roles, blueprints, employees, onHire, onImportBlueprint }: HireTabProps) {
  const [activeDepartment, setActiveDepartment] = useState<Department | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const hiredRoleNames = new Set(employees.map((e) => e.role));

  const filteredRoles = activeDepartment
    ? roles.filter((r) => r.department === activeDepartment)
    : roles;

  const handleHireClick = (role: Role) => {
    setSelectedRole(role);
  };

  const handleHireFromPanel = (data: HireCustomization) => {
    onHire(data);
    setSelectedRole(null);
  };

  return (
    <div className="space-y-8">
      {/* Industry Blueprints */}
      <section>
        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#EC4899]">
          Industry Blueprints
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Deploy a pre-built AI team for your industry
        </p>

        <div
          className="relative -mx-1 px-1"
          style={{
            maskImage: 'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)',
          }}
        >
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
            {blueprints.map((bp) => (
              <BlueprintCard key={bp.id} blueprint={bp} onDeploy={onImportBlueprint} />
            ))}
          </div>
        </div>
      </section>

      {/* Department filter pills */}
      <div className="flex flex-wrap gap-2">
        {DEPARTMENT_FILTERS.map(({ key, label }) => {
          const isActive = activeDepartment === key;
          const dept = key ? DEPARTMENT_INFO[key] : null;

          return (
            <button
              key={label}
              onClick={() => setActiveDepartment(key)}
              className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
              style={
                isActive
                  ? { backgroundColor: '#4F3588', color: '#FFFFFF' }
                  : {
                      backgroundColor: dept?.bgColor ?? '#F3F4F6',
                      color: dept?.color ?? '#6B7280',
                    }
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Role catalog grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredRoles.map((role) => (
          <RoleCard
            key={role.id}
            role={role}
            isHired={hiredRoleNames.has(role.name)}
            onHire={handleHireClick}
          />
        ))}

        {/* Create Custom Role card */}
        <button
          type="button"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-white p-5 text-gray-400 transition-all hover:border-[#4F3588] hover:text-[#4F3588]"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-xl">
            +
          </div>
          <span className="text-sm font-medium">Create Custom Role</span>
        </button>
      </div>

      {/* Role detail slide-out panel */}
      {selectedRole && (
        <RoleDetailPanel
          role={selectedRole}
          onClose={() => setSelectedRole(null)}
          onHire={handleHireFromPanel}
        />
      )}
    </div>
  );
}
