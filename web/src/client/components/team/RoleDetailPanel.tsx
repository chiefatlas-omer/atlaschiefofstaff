import { useEffect, useState } from 'react';
import {
  DEPARTMENT_INFO,
  TRUST_LEVEL_INFO,
  AGENT_MODEL_INFO,
  type Role,
  type TrustLevel,
  type AgentModel,
  type HireCustomization,
} from '../../lib/team-types';

interface RoleDetailPanelProps {
  role: Role;
  onClose: () => void;
  onHire: (data: HireCustomization) => void;
}

const TRUST_LEVELS: TrustLevel[] = ['supervised', 'trusted', 'autonomous'];
const MODELS: AgentModel[] = ['sonnet', 'opus'];

export function RoleDetailPanel({ role, onClose, onHire }: RoleDetailPanelProps) {
  const [visible, setVisible] = useState(false);
  const dept = DEPARTMENT_INFO[role.department];

  // Customization state
  const [customName, setCustomName] = useState(role.name);
  const [standingInstructions, setStandingInstructions] = useState('');
  const [hoursAllocated, setHoursAllocated] = useState(role.estimatedHours);
  const [trustLevel, setTrustLevel] = useState<TrustLevel>('supervised');
  const [model, setModel] = useState<AgentModel>('sonnet');

  // Animate in on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Reset state when role changes
  useEffect(() => {
    setVisible(false);
    const frame = requestAnimationFrame(() => setVisible(true));
    setCustomName(role.name);
    setStandingInstructions('');
    setHoursAllocated(role.estimatedHours);
    setTrustLevel('supervised');
    setModel('sonnet');
    return () => cancelAnimationFrame(frame);
  }, [role.id, role.name, role.estimatedHours]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  function handleHire() {
    onHire({ role, customName, standingInstructions, hoursAllocated, trustLevel, model });
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
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col bg-white shadow-xl transition-transform duration-200 ease-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Fixed header */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#F3F1FC]">
            <span className="text-2xl leading-none">{role.icon}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{role.name}</h2>
            <span
              className="text-xs font-medium"
              style={{ color: dept.color }}
            >
              {role.departmentLabel}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Description */}
          <div>
            <SectionLabel>About this role</SectionLabel>
            <p className="text-sm leading-relaxed text-gray-600">{role.description}</p>
          </div>

          {/* Responsibilities */}
          {role.responsibilities.length > 0 && (
            <div>
              <SectionLabel>What this role does</SectionLabel>
              <ul className="space-y-2">
                {role.responsibilities.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="mt-1 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#F3F1FC] text-[10px] font-semibold text-[#4F3588]">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Skills */}
          <div>
            <SectionLabel>Skills</SectionLabel>
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

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* Customization section */}
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#EC4899]">
              Customize before hiring
            </div>
            <p className="mb-4 text-xs text-gray-400">
              Set up this role to match your needs. You can change these later.
            </p>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]/20"
                  placeholder={role.name}
                />
              </div>

              {/* Standing instructions */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Standing instructions</label>
                <textarea
                  rows={3}
                  value={standingInstructions}
                  onChange={(e) => setStandingInstructions(e.target.value)}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]/20"
                  placeholder="E.g., Always use our brand voice guide. Focus on LinkedIn and Instagram. Report weekly."
                />
              </div>

              {/* Hours allocation */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Hours per month</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHoursAllocated(Math.max(1, hoursAllocated - 5))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={160}
                    value={hoursAllocated}
                    onChange={(e) => setHoursAllocated(Math.max(1, Math.min(160, Number(e.target.value) || 1)))}
                    className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-center text-sm font-medium text-gray-900 outline-none transition-colors focus:border-[#4F3588] focus:ring-1 focus:ring-[#4F3588]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setHoursAllocated(Math.min(160, hoursAllocated + 5))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50"
                  >
                    +
                  </button>
                  <span className="text-xs text-gray-400">hrs/month</span>
                </div>
              </div>

              {/* Trust level */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-700">Trust level</label>
                <div className="flex gap-2">
                  {TRUST_LEVELS.map((level) => {
                    const info = TRUST_LEVEL_INFO[level];
                    const isActive = trustLevel === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setTrustLevel(level)}
                        className="flex-1 rounded-lg border-2 px-3 py-2 text-center transition-all"
                        style={{
                          borderColor: isActive ? info.color : '#E5E7EB',
                          backgroundColor: isActive ? info.bgColor : '#FFFFFF',
                        }}
                      >
                        <div
                          className="text-xs font-semibold"
                          style={{ color: isActive ? info.color : '#6B7280' }}
                        >
                          {info.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  {TRUST_LEVEL_INFO[trustLevel].description}
                </p>
              </div>

              {/* AI Model */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-700">AI Model</label>
                <div className="flex gap-2">
                  {MODELS.map((m) => {
                    const info = AGENT_MODEL_INFO[m];
                    const isActive = model === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModel(m)}
                        className="flex-1 rounded-lg border-2 px-3 py-2 text-center transition-all"
                        style={{
                          borderColor: isActive ? info.color : '#E5E7EB',
                          backgroundColor: isActive ? info.bgColor : '#FFFFFF',
                        }}
                      >
                        <div
                          className="text-xs font-semibold"
                          style={{ color: isActive ? info.color : '#6B7280' }}
                        >
                          {info.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  {AGENT_MODEL_INFO[model].description}
                </p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* Sample tasks */}
          {role.sampleTasks.length > 0 && (
            <div>
              <SectionLabel>Example tasks</SectionLabel>
              <div className="space-y-2">
                {role.sampleTasks.map((task, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg bg-[#FAF9FE] px-3 py-2.5"
                  >
                    <span className="mt-0.5 text-xs text-[#A78BFA]">&#9679;</span>
                    <span className="text-sm leading-relaxed text-gray-600">{task}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Fixed footer */}
        <div className="border-t border-gray-200 px-6 py-4">
          <button
            onClick={handleHire}
            disabled={!customName.trim()}
            className="w-full rounded-lg bg-[#4F3588] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5A3C9E] disabled:opacity-50"
          >
            Hire {customName.trim() || role.name}
          </button>
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
      {children}
    </h3>
  );
}
