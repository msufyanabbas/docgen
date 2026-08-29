import { ShieldCheck } from 'lucide-react';
import { Checkbox } from './ui/Field';
import {
  ACTIONS, RESOURCES, RESOURCE_ACTIONS, RESOURCE_LABELS,
  type Action, type PermissionMap, type Resource,
} from '../lib/permissions';

/**
 * Grid of resource × action toggles.
 *
 * Admins are shown as fully granted and read-only — their access doesn't come
 * from this map, so letting it be edited would imply a restriction that isn't
 * enforced anywhere.
 */
export default function PermissionMatrix({
  value,
  onChange,
  readOnly = false,
}: {
  value: PermissionMap;
  onChange: (next: PermissionMap) => void;
  readOnly?: boolean;
}) {
  const toggle = (resource: Resource, action: Action, on: boolean) => {
    const next: PermissionMap = { ...value, [resource]: { ...(value[resource] ?? {}) } };
    if (on) {
      next[resource]![action] = true;
      // Anything you can do implies being able to see it.
      if (action !== 'view') next[resource]!.view = true;
    } else {
      delete next[resource]![action];
      // Losing view means losing everything on that resource.
      if (action === 'view') next[resource] = {};
    }
    onChange(next);
  };

  const rowAll = (resource: Resource, on: boolean) => {
    const next: PermissionMap = { ...value };
    next[resource] = on
      ? Object.fromEntries(RESOURCE_ACTIONS[resource].map((a) => [a, true]))
      : {};
    onChange(next);
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[520px]">
        <thead>
          <tr>
            <th className="th">Area</th>
            {ACTIONS.map((a) => (
              <th key={a} className="th w-20 text-center capitalize">{a}</th>
            ))}
            <th className="th w-16 text-center">All</th>
          </tr>
        </thead>
        <tbody>
          {RESOURCES.map((resource) => {
            const allowed = RESOURCE_ACTIONS[resource];
            const granted = value[resource] ?? {};
            const everything = allowed.every((a) => granted[a]);

            return (
              <tr key={resource} className="row-hover">
                <td className="td font-medium text-fg">{RESOURCE_LABELS[resource]}</td>

                {ACTIONS.map((action) => (
                  <td key={action} className="td text-center">
                    {allowed.includes(action) ? (
                      <span className="inline-flex justify-center">
                        <Checkbox
                          checked={Boolean(granted[action])}
                          onChange={(on) => !readOnly && toggle(resource, action, on)}
                          label={<span className="sr-only">{action} {RESOURCE_LABELS[resource]}</span>}
                        />
                      </span>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>
                ))}

                <td className="td text-center">
                  <span className="inline-flex justify-center">
                    <Checkbox
                      checked={everything}
                      onChange={(on) => !readOnly && rowAll(resource, on)}
                      label={<span className="sr-only">All {RESOURCE_LABELS[resource]}</span>}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {readOnly && (
        <p className="flex items-center gap-2 border-t border-line/60 px-4 py-2.5 text-[11px] text-fg-subtle">
          <ShieldCheck size={13} />
          Admins hold every permission — this is shown for reference and can't be narrowed.
        </p>
      )}
    </div>
  );
}
