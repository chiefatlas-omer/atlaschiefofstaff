import React, { useEffect, useState } from 'react';
import { api, SOP } from '../lib/api';
import SOPCard from '../components/SOPCard';

function isActive(sop: SOP) {
  const s = sop.status.toLowerCase();
  return s === 'published' || s === 'active';
}

function isDraft(sop: SOP) {
  return sop.status.toLowerCase() === 'draft';
}

export default function SOPs() {
  const [sops, setSops] = useState<SOP[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .sops()
      .then(setSops)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading SOPs...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 text-red-300">
        Failed to load SOPs: {error}
      </div>
    );
  }

  const activeSops = sops.filter(isActive);
  const draftSops = sops.filter(isDraft);
  const otherSops = sops.filter((s) => !isActive(s) && !isDraft(s));

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">SOP Library</h1>
        <p className="text-gray-500 text-sm mt-1">
          {sops.length} SOP{sops.length !== 1 ? 's' : ''} total
        </p>
      </div>

      {sops.length === 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-10 text-center">
          <p className="text-gray-500 text-sm">No SOPs generated yet.</p>
          <p className="text-gray-600 text-xs mt-2">
            Use <code className="text-purple-400">/generate-sop</code> in Slack to create your
            first SOP.
          </p>
        </div>
      )}

      {/* Active SOPs */}
      {activeSops.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-green-400 mb-4">
            Active SOPs ({activeSops.length})
          </h2>
          <div className="space-y-3">
            {activeSops.map((sop) => (
              <SOPCard key={sop.id} sop={sop} />
            ))}
          </div>
        </section>
      )}

      {/* Draft SOPs */}
      {draftSops.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-yellow-400 mb-4">
            Draft SOPs ({draftSops.length})
          </h2>
          <div className="space-y-3">
            {draftSops.map((sop) => (
              <SOPCard key={sop.id} sop={sop} />
            ))}
          </div>
        </section>
      )}

      {/* Other / unknown status */}
      {otherSops.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-400 mb-4">
            Other ({otherSops.length})
          </h2>
          <div className="space-y-3">
            {otherSops.map((sop) => (
              <SOPCard key={sop.id} sop={sop} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
