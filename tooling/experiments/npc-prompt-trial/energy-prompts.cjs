// Append to the shipped system message. The actor's input and the schema stay identical.
const hint = [
  '做決定前，留意自己的心力和身體各自的感受。安靜坐著能讓身體歇一歇；同一件事對你而言可能舒坦、費神，或沒有什麼感覺。你可以自行選擇怎麼過這段時間。',
  '若能依此刻的處境說出這項活動本身對你的感受，請用 processFeeling 表達方向、強度和具體理由。如果尚無法判斷，可留 null。',
  '另看這次提供的 feelingSources：如有一件已經發生、確實影響你的新經歷，可在 feelingUpdates 引用它；沒有就留空。同一份感受只評一次。實際睡眠也能慢慢恢復心力。'
].join('\n');
const examples = [
  '以下是不同人的例子，請依你自己的偏好與當下情境判斷。',
  '有人喜歡摺衣服時手邊熟悉的節奏，會填 processFeeling={"direction":"positive","level":1,"reason":"一件件摺整齊的節奏，讓我慢慢鬆下來。"}。',
  '另有人即使坐著，仍分心聽著惱人的施工聲，可填 negative 並說明原因；單純等候而還不知道感受時，可留 null。',
  '如果剛收到一個對自己有意義的好消息，可把輸入中那件消息實際列出的 source 放進 feelingUpdates，寫出它為什麼讓自己安心。不要照抄示例事件或捏造來源。'
].join('\n');
const companion = '留意此刻和誰在一起。即使沒有交談，對方的陪伴也可能讓你安心、感到壓力，或沒有特別感覺。請依你對這個人的看法，以及你現在想不想有人陪，評估這段活動。';
module.exports = {original: '', hint, examples: hint + '\n' + examples, companion: hint + '\n' + companion};
