import type { Resolution } from '@/lib/d20';

export default function ActionResolution({ resolution }: { resolution: Resolution }) {
  return <small>🎲 D20 {resolution.roll} {resolution.modifier >= 0 ? '+' : ''}{resolution.modifier} − DC {resolution.dc} = {resolution.total} · {({
    'critical-success': '大成功', success: '成功', mixed: '部分成功', failure: '失敗', 'critical-failure': '大失敗',
  })[resolution.outcome]}</small>;
}
