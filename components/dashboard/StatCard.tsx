export default function StatCard({
  label,
  value,
  tone = 'ink',
}: {
  label: string;
  value: number;
  tone?: 'ink' | 'ok' | 'accent' | 'bad';
}) {
  const color = { ink: 'text-ink', ok: 'text-ok', accent: 'text-accent2', bad: 'text-bad' }[tone];
  return (
    <div className="card animate-rise">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{label}</p>
      <p className={`mt-2 text-4xl font-black tabular-nums ${color}`}>{value.toLocaleString('fr-FR')}</p>
    </div>
  );
}
