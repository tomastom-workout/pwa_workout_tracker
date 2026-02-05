// ===== State =====
let exercises = null;
let currentPackage = 'α';
let workoutData = {};
let previousRecords = {}; // Cache for previous records
let selectedSetIndex = null;
let selectedExerciseId = null;

// ===== DOM Elements =====
const dateDisplay = document.getElementById('dateDisplay');
const exerciseList = document.getElementById('exerciseList');
const saveBtn = document.getElementById('saveBtn');
const exportBtn = document.getElementById('exportBtn');
const toast = document.getElementById('toast');
let tabs; // Will be initialized in init()

// ===== Date Helpers =====
function getTodayString() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function formatDisplayDate(dateStr) {
  const date = new Date(dateStr);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const day = days[date.getDay()];
  return `${y}/${m}/${d} (${day})`;
}

// ===== Storage =====
function getStorageKey(dateStr) {
  return `workout_${dateStr}`;
}

function loadTodayData() {
  const key = getStorageKey(getTodayString());
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse saved data:', e);
    }
  }
  return null;
}

function saveTodayData(showMessage = true) {
  const key = getStorageKey(getTodayString());
  const data = {
    date: getTodayString(),
    package: currentPackage,
    exercises: workoutData
  };
  localStorage.setItem(key, JSON.stringify(data));
  if (showMessage) {
    showToast('保存しました！');
  }
}

// ===== Auto Save =====
function autoSave() {
  saveTodayData(false); // Save without showing toast
}

// ===== Find Previous Record =====
function findPreviousRecord(exerciseId) {
  // Return cached if available
  if (previousRecords[exerciseId] !== undefined) {
    return previousRecords[exerciseId];
  }

  const today = getTodayString();
  const keys = [];

  // Collect all workout keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('workout_') && key !== getStorageKey(today)) {
      keys.push(key);
    }
  }

  // Sort by date descending
  keys.sort().reverse();

  // Find the most recent record for this exercise
  for (const key of keys) {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (data.exercises && data.exercises[exerciseId]) {
        previousRecords[exerciseId] = data.exercises[exerciseId];
        return data.exercises[exerciseId];
      }
    } catch (e) {
      continue;
    }
  }

  previousRecords[exerciseId] = null;
  return null;
}

// ===== Initialize Workout Data =====
function initWorkoutData(restorePackage = false) {
  const savedData = loadTodayData();

  if (savedData) {
    workoutData = savedData.exercises || {};
    // Only restore package on initial load, not on tab switch
    if (restorePackage && savedData.package) {
      currentPackage = savedData.package;
    }
  } else {
    workoutData = {};
  }

  // Initialize exercises for current package
  const packageExercises = exercises.packages[currentPackage];
  if (!packageExercises) return;

  for (const ex of packageExercises) {
    if (!workoutData[ex.id]) {
      // Try to load from previous record
      const prevRecord = findPreviousRecord(ex.id);

      if (prevRecord && prevRecord.sets) {
        workoutData[ex.id] = {
          sets: [...prevRecord.sets],
          completed: false
        };
      } else {
        // Use default
        const defaultWeight = ex.defaultWeight || 0;
        workoutData[ex.id] = {
          sets: [defaultWeight, defaultWeight, defaultWeight],
          completed: false
        };
      }
    }
  }
}

// ===== Render =====
function renderExercises() {
  const packageExercises = exercises.packages[currentPackage];
  if (!packageExercises) {
    exerciseList.innerHTML = '<div class="loading">種目が見つかりません</div>';
    return;
  }

  // Sort: incomplete first, completed last
  const sortedExercises = [...packageExercises].sort((a, b) => {
    const aCompleted = workoutData[a.id]?.completed || false;
    const bCompleted = workoutData[b.id]?.completed || false;
    return aCompleted - bCompleted;
  });

  exerciseList.innerHTML = sortedExercises.map(ex => {
    const data = workoutData[ex.id] || { sets: [0, 0, 0], completed: false };
    const isCompleted = data.completed;
    const isWeight = ex.type === 'weight';
    const prevRecord = findPreviousRecord(ex.id);

    return `
      <div class="exercise-card ${isCompleted ? 'completed' : ''}" data-id="${ex.id}">
        <div class="exercise-header">
          <button class="complete-check ${isCompleted ? 'checked' : ''}" data-id="${ex.id}">
            ${isCompleted ? '✓' : ''}
          </button>
          <span class="exercise-name">${ex.name}</span>
          <span class="exercise-type">${isWeight ? '重量' : '自重'}</span>
        </div>
        ${isWeight ? renderWeightSection(ex.id, data.sets, prevRecord) : renderBodyweightSection()}
      </div>
    `;
  }).join('');

  attachEventListeners();
}

function renderWeightSection(exerciseId, sets, prevRecord) {
  // Calculate comparison with previous record
  let comparisonHtml = '';
  if (prevRecord && prevRecord.sets) {
    const prevMax = Math.max(...prevRecord.sets);
    const currentMax = Math.max(...sets);
    const diff = currentMax - prevMax;

    if (diff > 0) {
      comparisonHtml = `<div class="prev-comparison up">前回 ${prevMax}kg → <span class="diff">+${diff}kg 🔥</span></div>`;
    } else if (diff < 0) {
      comparisonHtml = `<div class="prev-comparison down">前回 ${prevMax}kg → <span class="diff">${diff}kg</span></div>`;
    } else {
      comparisonHtml = `<div class="prev-comparison same">前回 ${prevMax}kg（同じ）</div>`;
    }
  }

  return `
    <div class="weight-section">
      ${comparisonHtml}
      <div class="sets-container">
        ${sets.map((weight, idx) => `
          <div class="set-input-wrapper">
            <div class="set-label">Set ${idx + 1}</div>
            <input type="number" 
                   class="set-input" 
                   data-exercise="${exerciseId}" 
                   data-set="${idx}"
                   value="${weight}"
                   inputmode="decimal">
            <div class="unit-label">kg</div>
          </div>
        `).join('')}
      </div>
      <div class="adjust-buttons">
        <button class="adjust-btn minus" data-exercise="${exerciseId}" data-delta="-5">-5</button>
        <button class="adjust-btn minus" data-exercise="${exerciseId}" data-delta="-2.5">-2.5</button>
        <button class="adjust-btn minus" data-exercise="${exerciseId}" data-delta="-1">-1</button>
        <button class="adjust-btn plus" data-exercise="${exerciseId}" data-delta="1">+1</button>
        <button class="adjust-btn plus" data-exercise="${exerciseId}" data-delta="2.5">+2.5</button>
        <button class="adjust-btn plus" data-exercise="${exerciseId}" data-delta="5">+5</button>
      </div>
    </div>
  `;
}

function renderBodyweightSection() {
  return `
    <div class="bodyweight-message">
      自重種目 - 完了したらチェック ✓
    </div>
  `;
}

// ===== Event Listeners =====
function attachEventListeners() {
  // Complete checkboxes
  document.querySelectorAll('.complete-check').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      toggleComplete(id);
    });
  });

  // Weight inputs
  document.querySelectorAll('.set-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const exerciseId = e.target.dataset.exercise;
      const setIdx = parseInt(e.target.dataset.set);
      const value = parseFloat(e.target.value) || 0;
      updateWeight(exerciseId, setIdx, value);
    });

    input.addEventListener('focus', (e) => {
      selectedExerciseId = e.target.dataset.exercise;
      selectedSetIndex = parseInt(e.target.dataset.set);
      e.target.select();
    });
  });

  // Adjust buttons
  document.querySelectorAll('.adjust-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const exerciseId = e.currentTarget.dataset.exercise;
      const delta = parseFloat(e.currentTarget.dataset.delta);
      adjustWeight(exerciseId, delta);
    });
  });
}

function toggleComplete(exerciseId) {
  if (!workoutData[exerciseId]) return;
  workoutData[exerciseId].completed = !workoutData[exerciseId].completed;
  autoSave(); // Auto save on completion toggle
  renderExercises();
}

function updateWeight(exerciseId, setIdx, value) {
  if (!workoutData[exerciseId]) return;
  workoutData[exerciseId].sets[setIdx] = value;
  autoSave(); // Auto save on weight change
  renderExercises(); // Re-render to update comparison
}

function adjustWeight(exerciseId, delta) {
  if (!workoutData[exerciseId]) return;

  // If a specific set is selected, adjust only that set
  if (selectedExerciseId === exerciseId && selectedSetIndex !== null) {
    const newVal = Math.max(0, workoutData[exerciseId].sets[selectedSetIndex] + delta);
    workoutData[exerciseId].sets[selectedSetIndex] = newVal;
  } else {
    // Adjust all sets
    workoutData[exerciseId].sets = workoutData[exerciseId].sets.map(w =>
      Math.max(0, w + delta)
    );
  }

  autoSave(); // Auto save on adjustment
  renderExercises();
}

// ===== Tabs =====
function initTabs() {
  tabs = document.querySelectorAll('.tab');
  console.log('initTabs: Found', tabs.length, 'tabs');

  tabs.forEach((tab, index) => {
    console.log('Tab', index, ':', tab.dataset.package);
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pkg = tab.dataset.package;
      console.log('Tab clicked:', pkg, 'current:', currentPackage);

      if (pkg === currentPackage) return;

      currentPackage = pkg;
      updateActiveTabs();
      initWorkoutData();
      autoSave(); // Auto save on package change
      renderExercises();
    });
  });
}

function updateActiveTabs() {
  tabs.forEach(tab => {
    if (tab.dataset.package === currentPackage) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
}

// ===== Export Data =====
function exportAllData() {
  const allData = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('workout_')) {
      try {
        allData.push(JSON.parse(localStorage.getItem(key)));
      } catch (e) {
        continue;
      }
    }
  }

  // Sort by date
  allData.sort((a, b) => a.date.localeCompare(b.date));

  const jsonStr = JSON.stringify(allData, null, 2);

  // Copy to clipboard
  navigator.clipboard.writeText(jsonStr).then(() => {
    showToast('データをコピーしました！');
  }).catch(() => {
    // Fallback: show in alert
    console.log(jsonStr);
    showToast('コンソールに出力しました');
  });
}

// ===== Toast =====
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// ===== Save Button =====
saveBtn.addEventListener('click', () => saveTodayData(true));
exportBtn.addEventListener('click', exportAllData);

// ===== Init =====
async function init() {
  // Display date
  dateDisplay.textContent = formatDisplayDate(getTodayString());

  // Load exercises
  try {
    const response = await fetch('exercises.json');
    exercises = await response.json();
  } catch (e) {
    exerciseList.innerHTML = '<div class="loading">種目データの読み込みに失敗しました</div>';
    console.error('Failed to load exercises:', e);
    return;
  }

  // Init
  initTabs();
  initWorkoutData(true); // Restore package from saved data on initial load
  updateActiveTabs();
  renderExercises();
}

init();
