import type { Blueprint } from '../../lib/team-types';

interface BlueprintCardProps {
  blueprint: Blueprint;
  onDeploy: (blueprint: Blueprint) => void;
}

export function BlueprintCard({ blueprint, onDeploy }: BlueprintCardProps) {
  return (
    <div className="group flex w-[280px] flex-shrink-0 flex-col rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-[#A78BFA] hover:shadow-md">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-[32px] leading-none">{blueprint.icon}</span>
        <span className="text-[15px] font-semibold text-gray-900">
          {blueprint.industry}
        </span>
      </div>

      <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-gray-600">
        {blueprint.description}
      </p>

      <p className="mb-4 line-clamp-1 text-xs text-gray-400">
        {blueprint.roles.join(', ')}
      </p>

      <div className="mt-auto flex items-center justify-between">
        <span className="rounded-full bg-[#F3F1FC] px-2.5 py-1 text-xs font-medium text-[#4F3588]">
          {blueprint.teamSize} employees
        </span>
        <button
          onClick={() => onDeploy(blueprint)}
          className="rounded-lg bg-[#4F3588] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#5A3C9E]"
        >
          Deploy
        </button>
      </div>
    </div>
  );
}
