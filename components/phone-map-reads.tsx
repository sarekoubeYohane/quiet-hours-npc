import { timeLabel, type Character, type World } from '@/lib/world';

export default function PhoneMapReads({ world, character }: { world: World; character: Character }) {
  if (!world.configuration) return null;
  const readings = (world.phones?.devices ?? []).flatMap(device =>
    (device.mapReads ?? []).filter(read => read.actorId === character.id).map(read => ({ ...read, deviceId:device.objectId }))
  ).sort((a,b) => b.at-a.at || a.offset-b.offset);
  return <details aria-label="手機地圖讀取紀錄">
    <summary>手機地圖讀取紀錄</summary>
    {!readings.length ? <p>角色尚未查閱手機地圖。</p> : <ul>{readings.map(read =>
      <li key={read.deviceId+':'+read.offset}>
        <time>第 {Math.floor(read.at/1440)+1} 天 · {timeLabel(read.at)}</time>
        <p>第 {read.offset+1} 頁 · {read.place?.name ?? '此頁沒有公開場所'}</p>
        {!!read.roads.length && <ul>{read.roads.map(road =>
          <li key={road.id}>公開道路通往 {road.name} · 步行約 {road.minutes} 分鐘</li>
        )}</ul>}
      </li>
    )}</ul>}
  </details>;
}
