// ================= 初期化とパスワード認証 =================
let questions = JSON.parse(localStorage.getItem('questions') || '[]');

// 互換初期化（欠損プロパティ補完）
questions.forEach(q => {
  q.score = q.score ?? 0;
  q.category = q.category ?? '';
  q.answerCount = q.answerCount ?? 0;
  q.correctCount = q.correctCount ?? 0;
  q.origin = q.origin ?? true; // 「通常問題」印
});

// アクセス制御
const password = prompt("パスワードを入力してください：");
if (password !== "2410") {
  document.body.innerHTML = '<h2>アクセスが拒否されました。</h2>';
  throw new Error("パスワード不正");
}

// 出題キュー
let currentQueue = [];
let currentIndex = 0;
let showAnswerToggle = false;

// ================= ユーティリティ =================
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ================= タブ切り替え =================
function switchTab(index) {
  document.querySelectorAll('.tab').forEach((tab, i) => tab.classList.toggle('active', i === index));
  document.querySelectorAll('.content').forEach((content, i) => content.classList.toggle('active', i === index));

  if (index === 2) {
    // 確認タブ
    renderList();
  }
  if (index === 0) {
    // 演習タブ
    updateCategoryOptions();
  }
  if (index === 3) {
    // グラフ＆記録
    renderChartByThreshold();
    renderRecords();
  }
}

// ================= カテゴリ選択肢の更新 =================
function updateCategoryOptions() {
  const select = document.getElementById('categorySelect');
  if (!select) return;
  const categories = [...new Set(questions.filter(q => q.origin).map(q => q.category || '未分類'))];
  select.innerHTML = '<option value="">すべてのカテゴリ</option>';
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });
}

// ================= 通常問題：保存 =================
function saveQuestion() {
  const q = document.getElementById('newQuestion').value.trim();
  const a = document.getElementById('newAnswer').value.trim();
  const c = document.getElementById('newCategory').value.trim();
  if (!q || !a) return;

  questions.push({
    question: q,
    answer: a,
    category: c,
    queue: 0,
    origin: true,
    score: 0,
    answerCount: 0,
    correctCount: 0
  });

  localStorage.setItem('questions', JSON.stringify(questions));
  document.getElementById('newQuestion').value = '';
  document.getElementById('newAnswer').value = '';
  document.getElementById('newCategory').value = '';
  updateCategoryOptions();
  renderChartByThreshold(); // 反映早め
}

// ================= 通常問題：出題ロジック =================
function startExercise() {
  const weighted = [];
  questions.forEach((q, i) => {
    if (!q.origin) return;
    const weight = Math.max(1, 10 - q.score);
    for (let j = 0; j < weight; j++) weighted.push({ ...q, index: i });
  });
  if (weighted.length === 0) return alert('問題がありません');
  shuffle(weighted);
  currentQueue = weighted;
  currentIndex = 0;
  nextQuestion();
}

function startLowScoreExercise() {
  const lowScore = questions.map((q, i) => ({ ...q, index: i })).filter(q => q.origin && q.score <= -3);
  if (lowScore.length === 0) return alert('スコア-3以下の問題がありません');
  const weighted = [];
  lowScore.forEach(q => {
    const weight = Math.max(1, 10 - q.score);
    for (let j = 0; j < weight; j++) weighted.push(q);
  });
  shuffle(weighted);
  currentQueue = weighted;
  currentIndex = 0;
  nextQuestion();
}

function startExerciseByCategory() {
  const selected = document.getElementById('categorySelect').value;
  const filtered = questions.map((q, i) => ({ ...q, index: i }))
    .filter(q => q.origin && (!selected || (q.category || '未分類') === selected));
  if (filtered.length === 0) return alert('該当カテゴリに問題がありません');
  const weighted = [];
  filtered.forEach(q => {
    const weight = Math.max(1, 10 - q.score);
    for (let j = 0; j < weight; j++) weighted.push(q);
  });
  shuffle(weighted);
  currentQueue = weighted;
  currentIndex = 0;
  nextQuestion();
}

function startScoreUnderThreeExercise() {
  // 表記に合わせて +4.5 以下を対象に修正
  const targetQuestions = questions.map((q, i) => ({ ...q, index: i }))
    .filter(q => q.origin && q.score <= 4.5);
  if (targetQuestions.length === 0) return alert('スコア+4.5以下の問題がありません');

  const weighted = [];
  targetQuestions.forEach(q => {
    const weight = Math.max(1, 10 - q.score);
    for (let j = 0; j < weight; j++) weighted.push(q);
  });

  shuffle(weighted);
  currentQueue = weighted;
  currentIndex = 0;
  nextQuestion();
}

function nextQuestion() {
  if (currentIndex >= currentQueue.length) {
    alert('全問終了');
    return;
  }
  const q = currentQueue[currentIndex];
  // ✏️ その場編集対応（演習Aタブ）
  document.getElementById('exerciseQuestion').innerHTML =
    `Q${q.index + 1}: <span id="questionText">${escapeHTML(q.question)}</span> ` +
    `<span class="edit-icon" onclick="editField('questionText', ${q.index}, 'question')">✏️</span>`;

  document.getElementById('correctAnswer').innerHTML =
    `<span id="answerText"></span> <span class="edit-icon" onclick="editField('answerText', ${q.index}, 'answer')">✏️</span>`;

  showAnswerToggle = false;
}

// ================= 採点・スコア更新・再出題挿入 =================
function gradeAnswer(grade) {
  if (!currentQueue.length) return;

  const q = currentQueue[currentIndex];
  const delta = grade === 'maru' ? 1 : grade === 'sankaku' ? -0.5 : -1;

  // スコア＆カウント更新
  questions[q.index].score += delta;
  questions[q.index].answerCount++;
  if (grade === 'maru') questions[q.index].correctCount++;

  // 🔁 不正解・部分正解は再出題として差し込み
  let insertOffset = null;
  if (grade === 'batsu') insertOffset = 5;
  if (grade === 'sankaku') insertOffset = 10;
  if (insertOffset !== null && currentIndex + insertOffset < currentQueue.length) {
    const retryItem = { ...q };
    currentQueue.splice(currentIndex + insertOffset, 0, retryItem);
  }

  // ▼ 日次記録を更新（Dタブの「記録欄」用）
  updateDailyRecord(grade === 'maru');

  // 保存と遷移
  localStorage.setItem('questions', JSON.stringify(questions));
  currentIndex++;
  nextQuestion();
}

// ================= 解答の表示/非表示（正答確認ボタン） =================
function checkCorrectAnswer() {
  if (!currentQueue.length) return;
  showAnswerToggle = !showAnswerToggle;
  const answerDisplay = document.getElementById('answerText');
  const answer = currentQueue[currentIndex]?.answer ?? '';
  answerDisplay.textContent = showAnswerToggle ? '正解: ' + answer : '';
}

// ================= 編集・削除（共通） =================
function editField(elementId, index, field) {
  const span = document.getElementById(elementId);
  const originalText = span.textContent.replace(/^正解:\s*/, '');
  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalText;

  input.addEventListener('blur', () => {
    const newValue = input.value.trim();
    span.textContent = field === 'answer' ? '正解: ' + newValue : newValue;
    questions[index][field] = newValue;
    localStorage.setItem('questions', JSON.stringify(questions));
    renderList();           // 反映
    renderChartByThreshold();
  });

  span.textContent = '';
  span.appendChild(input);
  input.focus();
}

function editQuestion(index, field, value) {
  questions[index][field] = value;
  localStorage.setItem('questions', JSON.stringify(questions));
}

function deleteQuestion(index) {
  if (!confirm('この問題を削除しますか？')) return;
  questions.splice(index, 1);
  localStorage.setItem('questions', JSON.stringify(questions));
  renderList();
  updateCategoryOptions();
  renderChartByThreshold();
}

// ================= 一覧描画（確認タブ） =================
function renderList() {
  const list = document.getElementById('questionList');
  if (!list) return;

  list.innerHTML = '';
  const grouped = {};
  questions.forEach((qa, i) => {
    if (!qa.origin) return;
    const cat = qa.category || '未分類';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ ...qa, index: i });
  });

  let count = 1;
  Object.keys(grouped).forEach(cat => {
    const groupTitle = document.createElement('h3');
    groupTitle.textContent = `カテゴリ: ${cat}`;
    list.appendChild(groupTitle);

    grouped[cat].forEach(qa => {
      const scoreClass = qa.score <= -3 ? 'red' : (qa.score >= 3 ? 'green' : '');
      const rate = (qa.answerCount > 0) ? ((qa.correctCount / qa.answerCount) * 100).toFixed(1) : '0.0';
      const li = document.createElement('li');
      li.innerHTML =
        `Q${count++}: <input value="${escapeAttr(qa.question)}" onchange="editQuestion(${qa.index}, 'question', this.value)" />
        ／ A: <input value="${escapeAttr(qa.answer)}" onchange="editQuestion(${qa.index}, 'answer', this.value)" />
        ／ カテゴリ: <input value="${escapeAttr(qa.category)}" onchange="editQuestion(${qa.index}, 'category', this.value)" />
        <span class="score ${scoreClass}">（${qa.score}）</span>
        回答数: ${qa.answerCount} ／ 正答率: ${rate}%
        <button onclick="deleteQuestion(${qa.index})">🗑削除</button>`;
      list.appendChild(li);
    });
  });
}

// ================= 入出力（通常問題のみ） =================
function downloadQuestions() {
  const original = questions.filter(q => q.origin);
  const blob = new Blob([JSON.stringify(original, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'questions.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function uploadQuestions() {
  const fileInput = document.getElementById('fileInputNormal');
  const file = fileInput?.files?.[0];
  if (!file) return alert('ファイルを選択してください');

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('format');

      questions = data.map(q => ({
        question: q.question,
        answer: q.answer,
        category: q.category ?? '',
        origin: true,
        score: q.score ?? 0,
        answerCount: q.answerCount ?? 0,
        correctCount: q.correctCount ?? 0
      }));

      localStorage.setItem('questions', JSON.stringify(questions));
      alert('インポート完了');
      renderList();
      updateCategoryOptions();
      renderChartByThreshold();
    } catch {
      alert('不正なデータです');
    }
  };
  reader.readAsText(file);
}

// ================= グラフ描画（Chart.js） =================
let chartInstance = null;

function renderChartByThreshold() {
  const sel = document.getElementById('scoreThresholdSelect');
  const threshold = sel ? parseInt(sel.value) : 3;
  renderChart(threshold);
}

function renderChart(threshold = 3) {
  const categoryStats = {};

  questions.forEach(q => {
    if (!q.origin) return;
    const cat = q.category || '未分類';
    if (!categoryStats[cat]) categoryStats[cat] = { total: 0, above: 0 };
    categoryStats[cat].total++;
    if ((q.score ?? 0) >= threshold) categoryStats[cat].above++;
  });

  const labels = Object.keys(categoryStats);
  const data = labels.map(cat => {
    const { total, above } = categoryStats[cat];
    const rate = total === 0 ? 0 : Math.round((above / total) * 100);
    return rate;
  });

  const canvas = document.getElementById('scoreChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: `スコア${threshold}以上の割合（%）`,
        data
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// ================= 日別 記録欄（Dタブ） =================
/*
  仕様：
  - 採点のたびに「本日」の total を +1、正解時は correct も +1
  - localStorage key: 'exerciseDailyRecords'
  - 形式: { "2025-09-02": { correct: 50, total: 60 }, ... }
  - Dタブのテーブル（#recordsTbody）に表示（降順）
*/

function updateDailyRecord(isCorrect) {
  const key = todayKey();
  const store = loadRecords();
  if (!store[key]) store[key] = { correct: 0, total: 0 };
  store[key].total += 1;
  if (isCorrect) store[key].correct += 1;
  saveRecords(store);

  // Dタブを見ている時は即時更新
  const graphTabActive = document.getElementById('graph-tab')?.classList.contains('active');
  if (graphTabActive) renderRecords();
}

function renderRecords() {
  const tbody = document.getElementById('recordsTbody');
  if (!tbody) return;

  const store = loadRecords();
  const rows = Object.keys(store)
    .map(dateStr => ({ dateStr, ...store[dateStr] }))
    .sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1)); // 新しい日付が上

  tbody.innerHTML = '';
  rows.forEach(({ dateStr, correct, total }) => {
    const tr = document.createElement('tr');
    const dateCell = document.createElement('td');
    dateCell.textContent = formatJPDate(dateStr);
    const countCell = document.createElement('td');
    countCell.style.textAlign = 'right';
    countCell.textContent = `${correct} / ${total}`;
    tr.appendChild(dateCell);
    tr.appendChild(countCell);
    tbody.appendChild(tr);
  });
}

function loadRecords() {
  return JSON.parse(localStorage.getItem('exerciseDailyRecords') || '{}');
}
function saveRecords(obj) {
  localStorage.setItem('exerciseDailyRecords', JSON.stringify(obj));
}
function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function formatJPDate(key) {
  // key: YYYY-MM-DD
  const [y, m, d] = key.split('-').map(n => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  const youbi = '日月火水木金土'.charAt(dt.getDay());
  // 例：2025　1/1（水）  （年と日付の間に全角スペース）
  return `${y}　${m}/${d}（${youbi}）`;
}

// ================= HTMLエスケープ補助 =================
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, s => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s]));
}
function escapeAttr(str) {
  // input value 用
  return String(str).replace(/"/g, '&quot;');
}

// ================= 初期レンダリング =================
document.addEventListener('DOMContentLoaded', () => {
  updateCategoryOptions();
  renderList();
  renderChartByThreshold();
  renderRecords();
});
