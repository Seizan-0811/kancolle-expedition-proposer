<template>
  <div class="app-root">
    <!-- ヘッダー -->
    <header class="app-header">
      <h1>🚢 艦これ遠征プランナー</h1>
      <p class="subtitle">所持艦娘を登録して、同時出撃できる最適な遠征編成を提案します</p>
    </header>

    <div class="app-body">
      <!-- ===== 左パネル: 所持艦娘 ===== -->
      <section class="panel panel-left">
        <h2 class="panel-title">艦娘登録</h2>

        <!-- タブ -->
        <div class="tabs tabs--vertical">
          <button :class="['tab-btn', { active: inputTab === 'manual' }]" @click="inputTab = 'manual'">手動入力</button>
          <button :class="['tab-btn', { active: inputTab === 'json' }]" @click="inputTab = 'json'">JSONインポート</button>
          <button :class="['tab-btn', { active: inputTab === 'kcweb' }]" @click="inputTab = 'kcweb'">kc-web</button>
        </div>

        <!-- 手動入力フォーム -->
        <div v-if="inputTab === 'manual'" class="form-card">
          <div class="form-row">
            <label class="form-label">艦種</label>
            <select v-model="form.shipTypeAbbr" class="input-select" @change="onTypeChange">
              <option v-for="opt in SHIP_TYPE_OPTIONS" :key="opt.abbr" :value="opt.abbr">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="form-row">
            <label class="form-label">艦名 <span class="optional">(任意)</span></label>
            <input v-model="form.name" class="input-text" placeholder="大淀 など" maxlength="20" />
          </div>
          <div class="form-row">
            <label class="form-label">Lv</label>
            <input v-model.number="form.level" type="number" class="input-number" min="1" max="175" />
          </div>
          <details class="stats-details">
            <summary>ステータス入力 <span class="optional">(省略すると要確認扱い)</span></summary>
            <div class="stats-grid">
              <div class="form-row">
                <label class="form-label">火力</label>
                <input v-model.number="form.fire" type="number" class="input-number" placeholder="–" min="0" />
              </div>
              <div class="form-row">
                <label class="form-label">対空</label>
                <input v-model.number="form.antiAir" type="number" class="input-number" placeholder="–" min="0" />
              </div>
              <div class="form-row">
                <label class="form-label">対潜</label>
                <input v-model.number="form.asw" type="number" class="input-number" placeholder="–" min="0" />
              </div>
              <div class="form-row">
                <label class="form-label">索敵</label>
                <input v-model.number="form.scout" type="number" class="input-number" placeholder="–" min="0" />
              </div>
            </div>
            <p class="stats-hint">※ 装備込みの値を入力してください</p>
          </details>
          <button class="btn btn-primary" @click="addShip">＋ 追加</button>
        </div>

        <!-- JSONインポート -->
        <div v-else-if="inputTab === 'json'" class="form-card">
          <p class="import-desc">以下の形式でJSON貼り付け:</p>
          <pre class="import-example">[
  { "type": "CL", "name": "大淀", "level": 175,
    "fire": 90, "antiAir": 100, "asw": 65, "scout": 90 },
  { "type": "DD", "name": "雪風", "level": 155 }
]</pre>
          <textarea v-model="importJson" class="import-textarea" placeholder="JSONを貼り付け..."></textarea>
          <p v-if="importError" class="error-msg">{{ importError }}</p>
          <button class="btn btn-primary" @click="importFromJson">インポート</button>
        </div>

        <!-- kc-web インポート -->
        <div v-else-if="inputTab === 'kcweb'" class="form-card">

          <!-- ── 方法1: ブックマークレット ── -->
          <div class="kcweb-method">
            <div class="kcweb-method-title">⭐ 方法1: ブックマークレット <span class="method-badge">かんたん</span></div>
            <ol class="kcweb-steps">
              <li>
                下のリンクをブラウザの<strong>ブックマークバーにドラッグ</strong>して登録
                <div class="bookmarklet-wrap">
                  <a :href="bookmarkletUrl" class="bookmarklet-link" @click.prevent>🔖 kc-web 艦娘データ取得</a>
                  <span class="bookmarklet-hint">← バーへドラッグ</span>
                </div>
                <p class="step-note">ブックマークバーが見えない場合: Chrome は Ctrl+Shift+B (Mac: ⌘+Shift+B) で表示できます</p>
              </li>
              <li><a href="https://noro6.github.io/kc-web/" target="_blank" rel="noopener">kc-web（制空権シミュレータ）</a>をブラウザで開いた状態で次を実行</li>
              <li>kc-web が開いている画面でブックマークバーの「kc-web 艦娘データ取得」をクリック</li>
              <li>「JSONインポート」タブに切り替えて、クリップボードの内容を貼り付けてインポート</li>
            </ol>
          </div>

          <div class="import-divider"><span>または</span></div>

          <!-- ── 方法2: コンソールスニペット ── -->
          <details class="kcweb-method kcweb-method--alt">
            <summary class="kcweb-method-title">方法2: コンソールスニペット <span class="method-badge method-badge--alt">上級者向け</span></summary>
            <ol class="kcweb-steps">
              <li>kc-web をブラウザで開く</li>
              <li>
                DevTools を開く
                <ul class="step-sub">
                  <li>Chrome / Edge: <kbd>F12</kbd> または <kbd>Ctrl+Shift+I</kbd>（Mac: <kbd>⌘+Option+I</kbd>）</li>
                  <li>Firefox: <kbd>F12</kbd></li>
                </ul>
              </li>
              <li>
                「Console」タブを選択し、下のスクリプトをコピーして貼り付け・実行
                <p class="step-note">⚠️ Chrome では初回に「allow pasting」または「貼り付けを許可」と入力してから貼り付けてください</p>
                <div class="snippet-container">
                  <pre class="snippet-code">{{ kcwebSnippet }}</pre>
                  <button class="btn-copy" @click="copySnippet">{{ snippetCopied ? 'コピー済 ✓' : 'コピー' }}</button>
                </div>
              </li>
              <li>「JSONインポート」タブに切り替えて、コピーされた内容を貼り付けてインポート</li>
            </ol>
          </details>

          <div class="import-divider"><span>または</span></div>

          <!-- ── 方法3: saveData インポート ── -->
          <details class="kcweb-method kcweb-method--alt">
            <summary class="kcweb-method-title">方法3: saveData インポート <span class="method-badge method-badge--alt">上級者向け</span></summary>
            <ol class="kcweb-steps">
              <li>kc-web の Console で以下を実行してコピー</li>
            </ol>
            <code class="savedata-cmd">copy(JSON.stringify(document.querySelector('#app').__vue__.$store.state.saveData.getMinifyData()))</code>
            <textarea v-model="kcwebSaveData" class="import-textarea mt-8" placeholder="コピーした値を貼り付け..."></textarea>
            <p v-if="kcwebError" class="error-msg">{{ kcwebError }}</p>
            <p v-if="kcwebStatus" class="status-msg">{{ kcwebStatus }}</p>
            <button class="btn btn-primary" :disabled="kcwebLoading || !kcwebSaveData.trim()" @click="importFromKcweb">
              {{ kcwebLoading ? '取得中...' : 'インポート' }}
            </button>
          </details>
        </div>

        <!-- 登録状況（簡易表示） -->
        <div class="ship-count-bar">
          登録済み: <strong>{{ ships.length }}隻</strong>
          <span v-if="excludedShipIds.size" class="excluded-count">（除外中: {{ excludedShipIds.size }}隻）</span>
          <span v-if="ships.length" class="ship-count-hint">← 右パネルの「登録済み艦娘」タブで確認・編集</span>
        </div>
      </section>

      <!-- ===== 右パネル ===== -->
      <div class="panel-right">
        <!-- 右パネルタブ -->
        <div class="right-tabs">
          <button :class="['tab-btn', { active: rightTab === 'expedition' }]" @click="rightTab = 'expedition'">遠征選択</button>
          <button :class="['tab-btn', { active: rightTab === 'ships' }]" @click="rightTab = 'ships'">
            登録済み艦娘
            <span v-if="ships.length" class="tab-count">{{ ships.length }}</span>
          </button>
        </div>

        <!-- 登録済み艦娘タブ -->
        <section v-if="rightTab === 'ships'" class="panel panel-ships">
          <div class="ship-list-header">
            <span>
              登録済み: {{ ships.length }}隻
              <span v-if="excludedShipIds.size" class="excluded-count">（除外中: {{ excludedShipIds.size }}隻）</span>
            </span>
            <div class="ship-list-actions">
              <button v-if="ships.length" class="btn btn-secondary-sm" @click="exportShipsJson">💾 保存</button>
              <label class="btn btn-secondary-sm">
                📂 読み込み
                <input type="file" accept=".json" style="display:none" @change="importFromFile" />
              </label>
              <button v-if="ships.length" class="btn btn-danger-sm" @click="clearShips">全削除</button>
            </div>
          </div>
          <div class="ship-list">
            <div class="ship-list-inner">
            <div v-if="!ships.length" class="empty-msg">艦娘を追加してください（左パネルから入力）</div>
            <details
              v-for="[typeId, typeShips] in shipsByType"
              :key="typeId"
              class="ship-type-group"
            >
              <summary class="ship-type-summary">
                <span class="ship-type-badge summary-badge" :style="{ background: typeColor(typeId) }">
                  {{ typeLabel(typeId) }}
                </span>
                <span class="summary-count">{{ typeShips.length }}隻</span>
                <span
                  v-if="typeShips.some(s => excludedShipIds.has(s.uniqueId))"
                  class="summary-excluded"
                >(除外中: {{ typeShips.filter(s => excludedShipIds.has(s.uniqueId)).length }}隻)</span>
              </summary>
              <div class="ship-type-body">
                <div
                  v-for="ship in typeShips"
                  :key="ship.uniqueId"
                  class="ship-item"
                  :class="{ 'ship-item--excluded': excludedShipIds.has(ship.uniqueId) }"
                >
                  <span class="ship-name">{{ ship.name }}</span>
                  <span class="ship-level">Lv{{ ship.level }}</span>
                  <span v-if="ship.canDaihatsu" class="daihatsu-badge" title="大発動艇系装備可能">大発</span>
                  <span v-if="ship.stats" class="ship-stats-mini">
                    火{{ ship.stats.fire }} 空{{ ship.stats.antiAir }} 潜{{ ship.stats.asw }} 索{{ ship.stats.scout }}
                  </span>
                  <span v-else class="ship-no-stats">ステータス未入力</span>
                  <button
                    class="btn-exclude"
                    :class="{ 'btn-exclude--active': excludedShipIds.has(ship.uniqueId) }"
                    @click="toggleExclude(ship.uniqueId)"
                    :title="excludedShipIds.has(ship.uniqueId) ? '除外解除' : '候補から除外'"
                  >{{ excludedShipIds.has(ship.uniqueId) ? '除外中' : '除外' }}</button>
                  <button class="btn-remove" @click="removeShip(ship.uniqueId)" title="削除">×</button>
                </div>
              </div>
            </details>
            </div><!-- /ship-list-inner -->
          </div>
        </section>

        <!-- 遠征選択タブ: 独自スクロール領域で包む -->
        <div v-if="rightTab === 'expedition'" class="expedition-tab-scroll">
        <!-- 遠征選択 -->
        <section class="panel">
          <h2 class="panel-title">遠征選択</h2>
          <p class="panel-desc">同時に出したい遠征を選んでください（複数可）</p>
          <div class="expedition-groups">
            <div v-for="[world, exps] in expeditionsByWorld" :key="world" class="exp-group">
              <div class="exp-group-label">{{ worldLabel(world) }}</div>
              <div class="exp-checkboxes">
                <label v-for="exp in exps" :key="exp.id" class="exp-checkbox-label">
                  <input
                    type="checkbox"
                    :value="exp.id"
                    v-model="selectedExpeditionIds"
                    class="exp-checkbox"
                  />
                  <span class="exp-id-badge">{{ exp.id }}</span>
                  <span class="exp-name">{{ exp.name }}</span>
                  <span class="exp-duration">{{ formatDuration(exp.durationMinutes) }}</span>
                </label>
              </div>
            </div>
          </div>
          <div class="propose-bar">
            <span class="selected-count">{{ selectedExpeditionIds.length }}件選択中</span>
            <button
              class="btn btn-propose"
              :disabled="!ships.length || !selectedExpeditionIds.length"
              @click="propose"
            >
              ⚓ 編成を提案する
            </button>
          </div>
        </section>

        <!-- 結果 -->
        <section v-if="matchResult" class="panel panel-result">
          <h2 class="panel-title">提案結果</h2>

          <!-- 未マッチ警告 -->
          <div v-if="matchResult.unmatched.length" class="unmatched-warning">
            ⚠️ 艦娘が不足して割り当て不可:
            <strong>{{ matchResult.unmatched.join(', ') }}</strong>
          </div>

          <div class="result-list">
            <div
              v-for="sug in matchResult.suggestions"
              :key="sug.expeditionId"
              class="result-card"
            >
              <!-- カードヘッダー -->
              <div class="result-card-header">
                <span class="result-id-badge">{{ sug.expeditionId }}</span>
                <span class="result-name">{{ sug.expeditionName }}</span>
                <span
                  class="result-status-badge"
                  :class="statusClass(sug.meetsStatRequirements)"
                >
                  {{ statusLabel(sug.meetsStatRequirements) }}
                </span>
              </div>

              <!-- 艦隊 -->
              <div class="result-fleet">
                <div
                  v-for="(ship, idx) in sug.ships"
                  :key="ship.uniqueId"
                  class="result-ship"
                >
                  <span class="flagship-mark" v-if="idx === 0">旗</span>
                  <span v-else class="fleet-num">{{ idx + 1 }}</span>
                  <span class="ship-type-badge sm" :style="{ background: typeColor(ship.shipTypeId) }">
                    {{ typeLabel(ship.shipTypeId) }}
                  </span>
                  <span class="result-ship-name">{{ ship.name }}</span>
                  <span class="result-ship-lv">Lv{{ ship.level }}</span>
                  <span v-if="ship.canDaihatsu" class="daihatsu-mark" title="大発動艇系装備可能">大発</span>
                </div>
              </div>

              <!-- ステータス比較 -->
              <div v-if="sug.totalStats" class="stats-compare">
                <div
                  v-for="key in statKeys"
                  :key="key.field"
                  class="stat-row"
                >
                  <span class="stat-label">{{ key.label }}</span>
                  <span
                    class="stat-value"
                    :class="{ 'stat-ok': sug.totalStats[key.field] >= getRequired(sug.expeditionId, key.field),
                               'stat-ng': sug.totalStats[key.field] < getRequired(sug.expeditionId, key.field) }"
                  >
                    {{ sug.totalStats[key.field] }}
                    <span class="stat-required">/ {{ getRequired(sug.expeditionId, key.field) }}</span>
                  </span>
                </div>
              </div>
              <div v-else class="stats-unknown">
                ステータス未入力のため要件確認不可 — ゲーム内で確認してください
              </div>

              <!-- 燃料・弾薬消費推定 -->
              <div v-if="sug.consumedFuel != null || sug.consumedAmmo != null" class="consumption-row">
                <span class="consumption-label">推定消費</span>
                <span v-if="sug.consumedFuel != null" class="consumption-fuel">🛢 {{ sug.consumedFuel }}</span>
                <span v-if="sug.consumedAmmo != null" class="consumption-ammo">💣 {{ sug.consumedAmmo }}</span>
                <span class="consumption-note">(各艦最大値の20%)</span>
              </div>
            </div>
          </div>
        </section>
        </div><!-- /expedition-tab-scroll -->
      </div>
    </div>

    <!-- フッター: 参照サイト一覧 -->
    <footer class="app-footer">
      <span class="footer-label">参照サイト</span>
      <a href="https://noro6.github.io/kc-web/" target="_blank" rel="noopener" class="footer-link">
        kc-web（制空権シミュレータ v2）
      </a>
      <span class="footer-sep">|</span>
      <a href="https://zekamashi.net/kancolle-kouryaku/new-ensei/" target="_blank" rel="noopener" class="footer-link">
        ぜかましねっと — マンスリー遠征条件一覧
      </a>
      <span class="footer-sep">|</span>
      <a href="https://zekamashi.net/kancolle-kouryaku/ensei-kihon/" target="_blank" rel="noopener" class="footer-link">
        ぜかましねっと — 遠征の基礎知識
      </a>
      <span class="footer-sep">|</span>
      <a href="https://github.com/KC3Kai/KC3Kai" target="_blank" rel="noopener" class="footer-link">
        KC3Kai
      </a>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { OwnedShip, Expedition, MatchResult, ShipStats } from './types'
import { matchExpeditions } from './expeditionMatcher'
import rawData from '../data/expeditions.json'

// ── 型キャスト ──────────────────────────────────────────────────────────────
const expeditions = (rawData as { expeditions: Expedition[] }).expeditions

// ── 艦種定義 ──────────────────────────────────────────────────────────────
const SHIP_TYPE_OPTIONS = [
  { label: '駆逐 (DD)',   abbr: 'DD',  typeId: 2  },
  { label: '軽巡 (CL)',   abbr: 'CL',  typeId: 3  },
  { label: '雷巡 (CLT)',  abbr: 'CLT', typeId: 4  },
  { label: '重巡 (CA)',   abbr: 'CA',  typeId: 5  },
  { label: '航巡 (CAV)',  abbr: 'CAV', typeId: 6  },
  { label: '軽母 (CVL)',  abbr: 'CVL', typeId: 7  },
  { label: '海防 (DE)',   abbr: 'DE',  typeId: 1  },
  { label: '水母 (AV)',   abbr: 'AV',  typeId: 16 },
  { label: '潜水 (SS)',   abbr: 'SS',  typeId: 13 },
  { label: '潜母 (AS)',   abbr: 'AS',  typeId: 20 },
] as const

const TYPE_COLORS: Record<number, string> = {
  1: '#4a9e8a', 2: '#3a7bd5', 3: '#8a6fb5', 4: '#c0605a',
  5: '#8b5a2b', 6: '#5a8b5a', 7: '#d4ac0d', 8: '#7d6b8a',
  9: '#6b7d8a', 10: '#8a7d6b', 11: '#c47c0e', 13: '#3a7d7d',
  14: '#4a8d8d', 15: '#8a6a3a', 16: '#5a8baa', 17: '#6b8a3a',
  18: '#c47c0e', 20: '#7d5a3a', 21: '#8a6fb5', 22: '#4a6a8a',
}

const TYPE_LABELS: Record<number, string> = {
  1: '海防', 2: '駆逐', 3: '軽巡', 4: '雷巡', 5: '重巡',
  6: '航巡', 7: '軽母', 8: '高戦', 9: '戦艦', 10: '航戦',
  11: '空母', 13: '潜水', 14: '潜母', 15: '補給艦', 16: '水母',
  17: '揚陸艦', 18: '装甲母', 20: '潜母艦', 21: '練巡', 22: '工作艦',
}

function typeColor(typeId: number) { return TYPE_COLORS[typeId] ?? '#555' }
function typeLabel(typeId: number) { return TYPE_LABELS[typeId] ?? `T${typeId}` }

// ── 状態 ──────────────────────────────────────────────────────────────────
const inputTab = ref<'manual' | 'json' | 'kcweb'>('manual')
const rightTab = ref<'expedition' | 'ships'>('expedition')
const ships = ref<OwnedShip[]>([])
const selectedExpeditionIds = ref<string[]>(['A4', 'A5', 'A6'])
const matchResult = ref<MatchResult | null>(null)

// フォーム状態
const form = ref({
  shipTypeAbbr: 'DD',
  shipTypeId: 2,
  name: '',
  level: 99,
  fire: null as number | null,
  antiAir: null as number | null,
  asw: null as number | null,
  scout: null as number | null,
})

const importJson = ref('')
const importError = ref('')
let nextId = 1

// 候補除外セット (uniqueId で管理; 削除せず一時的に除外)
const excludedShipIds = ref(new Set<number>())

function toggleExclude(uniqueId: number) {
  const next = new Set(excludedShipIds.value)
  if (next.has(uniqueId)) next.delete(uniqueId)
  else next.add(uniqueId)
  excludedShipIds.value = next
  matchResult.value = null
}

// ── localStorage 永続化 ────────────────────────────────────────────────────
const LS_KEY = 'kancolle-expedition-ships'

onMounted(() => {
  try {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as OwnedShip[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        ships.value = parsed
        nextId = Math.max(...parsed.map(s => s.uniqueId), 0) + 1
      }
    }
  } catch {
    // 読み込み失敗は無視
  }
})

watch(ships, (val) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(val))
  } catch {
    // 書き込み失敗は無視
  }
}, { deep: true })

// ── JSONエクスポート ────────────────────────────────────────────────────────
function exportShipsJson() {
  const json = JSON.stringify(ships.value, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kancolle-ships-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ── ファイルからインポート ─────────────────────────────────────────────────
function importFromFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target?.result as string) as OwnedShip[]
      if (!Array.isArray(data)) throw new Error('配列形式のJSONファイルを選択してください')
      ships.value = data
      nextId = Math.max(...data.map(s => s.uniqueId), 0) + 1
      matchResult.value = null
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ファイルの読み込みに失敗しました')
    }
  }
  reader.readAsText(file)
  // input をリセット（同じファイルを再選択できるよう）
  ;(event.target as HTMLInputElement).value = ''
}

// kc-web インポート
const kcwebSaveData = ref('')
const kcwebError = ref('')
const kcwebStatus = ref('')
const kcwebLoading = ref(false)
const snippetCopied = ref(false)

// kc-web ブラウザコンソール用スニペット
// kc-web は Vue2 + Vuex + IndexedDB(Dexie) を使用
// saveData と ships マスターはどちらも Vuex store.state に既にロード済み
const kcwebSnippet = `(async function() {
  // notes/kc-web-data-format.md の SHIP_TYPE enum に準拠
  const TYPE = {1:'DE',2:'DD',3:'CL',4:'CLT',5:'CA',6:'CAV',
                7:'CVL',8:'FBB',9:'BB',10:'BBV',11:'CV',
                13:'SS',14:'SSV',15:'AO',16:'AV',17:'LHA',18:'CVB',20:'AS',21:'CT',22:'AR'};

  // Vuex ストアを探す (Vue 2 / Vue 3 / DOM探索の3段階)
  function findStore() {
    const el = document.querySelector('#app');
    // Vue 2
    if (el?.__vue__?.$store) return el.__vue__.$store;
    // Vue 3 + Vuex 4
    if (el?.__vue_app__?.config?.globalProperties?.$store)
      return el.__vue_app__.config.globalProperties.$store;
    // Vue 2: 子要素を再帰探索 (本番ビルドで #app に __vue__ が付かない場合)
    function walk(node) {
      if (!node) return null;
      if (node.__vue__?.$store?.state?.ships?.length) return node.__vue__.$store;
      for (const child of (node.children || [])) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    }
    return walk(el || document.body);
  }
  const store = findStore();
  if (!store) {
    const msg = '❌ kc-webのデータを取得できませんでした。\\nkc-web（制空権シミュレータ）を開いているタブで実行しているか確認してください。';
    console.error(msg);
    alert(msg);
    return;
  }

  // ShipMaster[]: .id .type .name .fire .antiAir .minAsw .maxAsw .minScout .maxScout
  const masterMap = new Map(store.state.ships.map(s => [s.id, s]));

  // --- 大発動艇系装備可否判定 (カテゴリID = 24) ---
  // store.state.shipTypes = api_mst_stype: { api_id: 艦種ID, api_equip_type: number[] }[]
  // store.state.equipShips = api_mst_equip_ship: { [masterId]: { api_equip_type: { [catId]: itemIds[]|null } } }
  const DAIHATSU_CAT = 24;
  const stypeMap  = new Map((store.state.shipTypes || []).map(st => [st.api_id, st.api_equip_type || []]));
  const equipShps = store.state.equipShips || {};
  function canDaihatsu(masterId, shipType) {
    if ((stypeMap.get(shipType) || []).includes(DAIHATSU_CAT)) return true;
    const ov = equipShps[masterId];
    return !!(ov?.api_equip_type && (DAIHATSU_CAT in ov.api_equip_type));
  }

  // --- 所持艦娘全体 (state.shipStock: ShipStock[]) ---
  const stockList = store.state.shipStock;
  if (!stockList?.length) {
    const msg = '❌ 所持艦娘データが0件です。\\nkc-webで艦娘在庫を読み込んでから再度実行してください。';
    console.error(msg);
    alert(msg);
    return;
  }

  // --- 全所持艦娘を変換 (素ステータス + 近代化改修ボーナスのみ、装備は含まない) ---
  const ships = [];
  for (const stock of stockList) {
    const m   = masterMap.get(stock.id);
    const lv  = stock.level ?? 1;
    const imp = stock.improvement ?? {};

    // master.fire/antiAir は改修MAX込みの素ステータス最大値のため加算不要
    // master.minAsw/maxAsw はレベル計算が必要、imp.asw は対潜近代化改修ボーナス
    const fire    = m ? m.fire    : 0;
    const antiAir = m ? m.antiAir : 0;
    const asw     = (m ? (m.minAsw   + Math.floor((m.maxAsw   - m.minAsw)   * lv / 99)) : 0) + (imp.asw ?? 0);
    const scout   =  m ? (m.minScout + Math.floor((m.maxScout - m.minScout) * lv / 99)) : 0;

    ships.push({ type: TYPE[m?.type ?? 0] ?? 'DD', name: m?.name ?? ('艦#' + stock.id),
                 level: lv, fire, antiAir, asw, scout,
                 fuel: m?.fuel ?? 0, ammo: m?.ammo ?? 0,
                 canDaihatsu: canDaihatsu(stock.id, m?.type ?? 0) });
  }

  const daihatsuCount = ships.filter(s => s.canDaihatsu).length;
  console.log(\`所持艦娘: \${ships.length}隻 (大発装備可: \${daihatsuCount}隻) ※素ステータス+近代化改修のみ\`);
  const json = JSON.stringify(ships, null, 2);
  console.log(json);
  try {
    await navigator.clipboard.writeText(json);
    console.log('✓ クリップボードにコピーしました。JSONインポートタブに貼り付けてください。');
    alert('✅ 艦娘データ（' + ships.length + '隻）をクリップボードにコピーしました！\\n遠征プランナーの「JSONインポート」タブに貼り付けてください。');
  } catch(e) {
    console.log('クリップボードへのコピーに失敗しました。↑ 上のJSONを手動でコピーしてJSONインポートタブに貼り付けてください。');
    alert('⚠️ クリップボードへのコピーに失敗しました。\\nコンソールに出力されたJSONをコピーして「JSONインポート」タブに貼り付けてください。');
  }
})();`

// ブックマークレット URL (スニペットをそのまま javascript: プロトコルにエンコード)
const bookmarkletUrl = computed(() => `javascript:${encodeURIComponent(kcwebSnippet)}`)

function copySnippet() {
  navigator.clipboard.writeText(kcwebSnippet).then(() => {
    snippetCopied.value = true
    setTimeout(() => { snippetCopied.value = false }, 2000)
  })
}

// saveData ツリーから raw ship 情報を収集
// SavedShip の is[] (装備スロット) と ex (補強増設) も取得する
interface RawKcSlot { i?: number }
interface RawKcShip { i: number; lv?: number; un?: number; is?: RawKcSlot[]; ex?: RawKcSlot }
type SaveDataNode = { isDirectory?: boolean; manager?: string; childItems?: unknown[] }

function collectKcShips(node: SaveDataNode): RawKcShip[] {
  const result: RawKcShip[] = []
  if (!node.isDirectory && node.manager) {
    try {
      const m = JSON.parse(node.manager) as { fleetInfo?: { fleets?: { ships?: RawKcShip[] }[] } }
      for (const fleet of m?.fleetInfo?.fleets ?? [])
        for (const ship of fleet.ships ?? [])
          if (ship.i > 0) result.push(ship)
    } catch { /* skip */ }
  }
  for (const child of node.childItems ?? [])
    result.push(...collectKcShips(child as SaveDataNode))
  return result
}

// kc-web の Firebase master.json から艦船+装備マスターを取得
// MasterShip フィールド: id, type, name, fire, anti_air(snake), min_asw, asw, min_scout, scout
// MasterItem  フィールド: id, fire, antiAir(camel), asw, scout
const FIREBASE_MASTER_URL = 'https://firebasestorage.googleapis.com/v0/b/development-74af0.appspot.com/o/master.json?alt=media'

interface MasterShipRaw { id: number; type: number; name: string; fire: number; anti_air: number; min_asw: number; asw: number; min_scout: number; scout: number; fuel: number; ammo: number }
interface MasterShipTypeRaw { api_id: number; api_equip_type?: number[] }
type MasterEquipShipRaw = Record<number, { api_equip_type?: Record<number, number[] | null> }>

async function fetchKcwebMaster(): Promise<{
  shipMap: Map<number, MasterShipRaw>
  canDaihatsuSet: Set<number>
}> {
  const DAIHATSU_CAT = 24
  const resp = await fetch(FIREBASE_MASTER_URL, { cache: 'force-cache' })
  if (!resp.ok) throw new Error(`Firebase master.json fetch failed: HTTP ${resp.status}`)
  const json = await resp.json() as {
    ships?: MasterShipRaw[]
    api_mst_stype?: MasterShipTypeRaw[]
    api_mst_equip_ship?: MasterEquipShipRaw
  }
  const shipMap = new Map((json.ships ?? []).map(s => [s.id, s]))

  // 大発装備可否判定: 艦種レベル + 個別オーバーライドの両方をチェック
  const stypeMap = new Map((json.api_mst_stype ?? []).map(st => [st.api_id, st.api_equip_type ?? []]))
  const equipShipRaw = json.api_mst_equip_ship ?? {}
  const canDaihatsuSet = new Set<number>()
  for (const s of json.ships ?? []) {
    const typeOk = (stypeMap.get(s.type) ?? []).includes(DAIHATSU_CAT)
    const shipOk = DAIHATSU_CAT in (equipShipRaw[s.id]?.api_equip_type ?? {})
    if (typeOk || shipOk) canDaihatsuSet.add(s.id)
  }

  return { shipMap, canDaihatsuSet }
}

// 素ステータスのみ計算 (装備は含まない)
// MasterShip は snake_case: anti_air, min_asw, min_scout
function calcBaseStats(
  lv: number,
  sm: MasterShipRaw,
): ShipStats {
  return {
    fire:    sm.fire,
    antiAir: sm.anti_air,
    asw:     sm.min_asw   + Math.floor((sm.asw   - sm.min_asw)   * lv / 99),
    scout:   sm.min_scout + Math.floor((sm.scout - sm.min_scout) * lv / 99),
  }
}

async function importFromKcweb() {
  kcwebError.value = ''
  kcwebStatus.value = ''
  kcwebLoading.value = true

  try {
    // saveData パース
    let root: SaveDataNode
    try {
      root = JSON.parse(kcwebSaveData.value)
    } catch {
      throw new Error('JSONのパースに失敗しました。saveDataの値をそのまま貼り付けてください。')
    }

    const rawShips = collectKcShips(root)
    if (rawShips.length === 0) throw new Error('艦娘データが見つかりませんでした。saveData の値を確認してください。')

    // 重複排除
    const seen = new Map<string, RawKcShip>()
    for (const s of rawShips) {
      const key = (s.un != null && s.un > 0) ? `u:${s.un}` : `m:${s.i}`
      if (!seen.has(key)) seen.set(key, s)
    }

    // 艦船マスターを取得（Firebase → KC3Kai フォールバック）
    kcwebStatus.value = '艦船マスターを取得中...'
    let shipMap = new Map<number, MasterShipRaw>()
    let canDaihatsuSet = new Set<number>()

    try {
      const master = await fetchKcwebMaster()
      shipMap = master.shipMap
      canDaihatsuSet = master.canDaihatsuSet
      kcwebStatus.value = `マスター取得完了 (艦船 ${shipMap.size}隻)`
    } catch {
      // Firebase 失敗 → KC3Kai から艦船のみ取得
      kcwebStatus.value = 'Firebase失敗、KC3Kaiから艦船マスターを取得中...'
      try {
        type KC3Ship = { id?: number; type?: number; name?: string }
        const resp = await fetch(
          'https://raw.githubusercontent.com/KC3Kai/KC3Kai/master/src/data/entities/ships.nedb',
          { cache: 'force-cache' }
        )
        if (resp.ok) {
          for (const line of (await resp.text()).trim().split('\n')) {
            try {
              const s = JSON.parse(line) as KC3Ship
              const id = Number(s.id ?? 0)
              if (id > 0 && s.type)
                shipMap.set(id, { id, type: Number(s.type), name: String(s.name ?? `艦#${id}`),
                  fire: 0, anti_air: 0, min_asw: 0, asw: 0, min_scout: 0, scout: 0, fuel: 0, ammo: 0 })
            } catch { /* skip */ }
          }
        }
        kcwebStatus.value = `⚠️ 艦船マスターのみ取得 (${shipMap.size}隻) — ステータス計算不可`
      } catch {
        kcwebStatus.value = '⚠️ マスター取得失敗 — 艦種を DD として仮インポート'
      }
    }

    // OwnedShip に変換 (素ステータスのみ、装備は含まない)
    let imported = 0
    for (const [, raw] of seen) {
      const sm = shipMap.get(raw.i)
      const lv = raw.lv ?? 1
      const stats = sm ? calcBaseStats(lv, sm) : undefined
      ships.value.push({
        masterId: raw.i,
        uniqueId: (raw.un != null && raw.un > 0) ? raw.un : nextId++,
        shipTypeId: sm?.type ?? 2,
        name: sm?.name ?? `艦#${raw.i}`,
        level: lv,
        stats,
        fuel: sm?.fuel,
        ammo: sm?.ammo,
        canDaihatsu: canDaihatsuSet.has(raw.i),
      })
      imported++
    }

    kcwebSaveData.value = ''
    kcwebStatus.value = `✅ ${imported}隻をインポートしました（素ステータス+近代化改修のみ）`
    matchResult.value = null
  } catch (e) {
    kcwebError.value = e instanceof Error ? e.message : String(e)
  } finally {
    kcwebLoading.value = false
  }
}

// ── フォーム操作 ────────────────────────────────────────────────────────────
function onTypeChange() {
  const found = SHIP_TYPE_OPTIONS.find(o => o.abbr === form.value.shipTypeAbbr)
  if (found) form.value.shipTypeId = found.typeId
}

function addShip() {
  const hasStats = [form.value.fire, form.value.antiAir, form.value.asw, form.value.scout]
    .every(v => v !== null && v !== undefined && !isNaN(v as number))
  const stats = hasStats
    ? { fire: form.value.fire!, antiAir: form.value.antiAir!, asw: form.value.asw!, scout: form.value.scout! }
    : undefined

  const defaultName = SHIP_TYPE_OPTIONS.find(o => o.abbr === form.value.shipTypeAbbr)?.label.split(' ')[0] ?? '艦娘'

  ships.value.push({
    masterId: 0,
    uniqueId: nextId++,
    shipTypeId: form.value.shipTypeId,
    name: form.value.name.trim() || defaultName,
    level: form.value.level,
    stats,
  })
  form.value.name = ''
  matchResult.value = null
}

function removeShip(uniqueId: number) {
  ships.value = ships.value.filter(s => s.uniqueId !== uniqueId)
  const next = new Set(excludedShipIds.value)
  next.delete(uniqueId)
  excludedShipIds.value = next
  matchResult.value = null
}

function clearShips() {
  ships.value = []
  excludedShipIds.value = new Set()
  matchResult.value = null
}

// ── JSONインポート ──────────────────────────────────────────────────────────
// notes/kc-web-data-format.md の SHIP_TYPE enum に準拠
const TYPE_MAP: Record<string, number> = {
  DE: 1, DD: 2, CL: 3, CLT: 4, CA: 5, CAV: 6, CVL: 7,
  FBB: 8, BB: 9, BBV: 10, CV: 11, SS: 13, SSV: 14,
  AO: 15, AV: 16, LHA: 17, CVB: 18, AS: 20, CT: 21, AR: 22,
}

function importFromJson() {
  importError.value = ''
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = JSON.parse(importJson.value) as any[]
    if (!Array.isArray(data)) throw new Error('配列形式 ([ ... ]) で入力してください')
    for (const entry of data) {
      const typeId = TYPE_MAP[String(entry.type).toUpperCase()]
      if (!typeId) throw new Error(`不明な艦種: "${entry.type}" — DE/DD/CL/CA 等を指定してください`)
      const f = Number(entry.fire), aa = Number(entry.antiAir), as_ = Number(entry.asw), sc = Number(entry.scout)
      const stats = [f, aa, as_, sc].every(v => !isNaN(v) && v >= 0) ? { fire: f, antiAir: aa, asw: as_, scout: sc } : undefined
      const fuel = entry.fuel != null && !isNaN(Number(entry.fuel)) ? Number(entry.fuel) : undefined
      const ammo = entry.ammo != null && !isNaN(Number(entry.ammo)) ? Number(entry.ammo) : undefined
      const canDaihatsu = entry.canDaihatsu === true
      ships.value.push({
        masterId: 0,
        uniqueId: nextId++,
        shipTypeId: typeId,
        name: String(entry.name || entry.type),
        level: Math.max(1, Number(entry.level) || 1),
        stats,
        fuel,
        ammo,
        canDaihatsu,
      })
    }
    importJson.value = ''
    matchResult.value = null
  } catch (e: unknown) {
    importError.value = e instanceof Error ? e.message : String(e)
  }
}

// ── 艦種別グループ ──────────────────────────────────────────────────────────
const SHIP_TYPE_ORDER = [2, 3, 4, 5, 6, 7, 11, 18, 8, 9, 10, 13, 14, 16, 20, 1, 21, 15, 17, 22]
// DD, CL, CLT, CA, CAV, CVL, CV, CVB, FBB, BB, BBV, SS, SSV, AV, 潜母艦, DE, CT, 補給艦, 揚陸艦, 工作艦

const shipsByType = computed(() => {
  const groups = new Map<number, OwnedShip[]>()
  for (const ship of ships.value) {
    if (!groups.has(ship.shipTypeId)) groups.set(ship.shipTypeId, [])
    groups.get(ship.shipTypeId)!.push(ship)
  }
  const ordered = SHIP_TYPE_ORDER
    .filter(id => groups.has(id))
    .map(id => [id, groups.get(id)!] as [number, OwnedShip[]])
  for (const [id, list] of groups) {
    if (!SHIP_TYPE_ORDER.includes(id)) ordered.push([id, list])
  }
  return ordered
})

// ── 遠征グループ ──────────────────────────────────────────────────────────
const WORLD_LABELS: Record<number, string> = {
  1: '鎮守府海域 (1-X)',
  2: '南西諸島 (2-X)',
  4: '西方海域 (4-X)',
  5: '南方海域 (5-X)',
  7: '南西海域 (7-X)',
}
function worldLabel(world: number) { return WORLD_LABELS[world] ?? `World ${world}` }

const expeditionsByWorld = computed(() => {
  const groups = new Map<number, Expedition[]>()
  for (const exp of expeditions) {
    if (!groups.has(exp.world)) groups.set(exp.world, [])
    groups.get(exp.world)!.push(exp)
  }
  // world 順: 1, 2, 7, 4, 5
  const ORDER = [1, 2, 7, 4, 5]
  return ORDER
    .filter(w => groups.has(w))
    .map(w => [w, groups.get(w)!] as [number, Expedition[]])
})

function formatDuration(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`
}

// ── 編成提案 ──────────────────────────────────────────────────────────────
function propose() {
  const selected = expeditions.filter(e => selectedExpeditionIds.value.includes(e.id))
  const available = ships.value.filter(s => !excludedShipIds.value.has(s.uniqueId))
  matchResult.value = matchExpeditions(available, selected)
}

// ── 結果表示ヘルパー ─────────────────────────────────────────────────────
const statKeys = [
  { field: 'fire'    as const, label: '火力' },
  { field: 'antiAir' as const, label: '対空' },
  { field: 'asw'     as const, label: '対潜' },
  { field: 'scout'   as const, label: '索敵' },
]

const expeditionMap = new Map(expeditions.map(e => [e.id, e]))

function getRequired(expId: string, field: 'fire' | 'antiAir' | 'asw' | 'scout'): number {
  return expeditionMap.get(expId)?.statRequirements[field] ?? 0
}

function statusClass(meets: boolean | null) {
  if (meets === true) return 'status-ok'
  if (meets === false) return 'status-ng'
  return 'status-unknown'
}

function statusLabel(meets: boolean | null) {
  if (meets === true) return '✅ 条件充足'
  if (meets === false) return '⚠️ 要装備確認'
  return '❓ ステータス未確認'
}
</script>

<style scoped>
/* ── レイアウト ─────────────────────────────────────────── */
.app-root { height: 100vh; overflow: hidden; display: flex; flex-direction: column; }

.app-header {
  background: linear-gradient(135deg, #0d1b2e 0%, #1a3a5c 100%);
  padding: 20px 28px;
  border-bottom: 2px solid #2a5a8c;
}
.app-header h1 { font-size: 1.5rem; font-weight: 700; color: #e8f4ff; }
.subtitle { margin-top: 4px; font-size: 0.82rem; color: #7aa8cc; }

.app-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
  padding: 16px;
  align-items: stretch;
  overflow: hidden;
}

/* ── パネル共通 ──────────────────────────────────────────── */
.panel {
  background: #1e2840;
  border: 1px solid #2e3f60;
  border-radius: 8px;
  padding: 16px;
}
.panel-left { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; overflow-y: auto; }
.panel-right { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; min-height: 0; overflow: hidden; }
.panel-title {
  font-size: 1rem;
  font-weight: 700;
  color: #a8c8f0;
  border-bottom: 1px solid #2e3f60;
  padding-bottom: 8px;
  margin-bottom: 12px;
}
.panel-desc { font-size: 0.8rem; color: #7a9ab8; margin-bottom: 10px; }

/* ── タブ ──────────────────────────────────────────────── */
.tabs { display: flex; gap: 6px; margin-bottom: 12px; }
.tabs--vertical { flex-direction: column; }
.tab-btn {
  flex: 1; padding: 6px; border: 1px solid #2e3f60; border-radius: 6px;
  background: #151e30; color: #8aa8c0; cursor: pointer; font-size: 0.82rem;
  transition: all 0.15s; text-align: left;
}
.tab-btn.active { background: #2a4a7c; color: #e0f0ff; border-color: #4a7abc; }

/* ── フォーム ──────────────────────────────────────────── */
.form-card { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.form-row { display: flex; align-items: center; gap: 8px; }
.form-label { width: 60px; font-size: 0.82rem; color: #8aa8c0; flex-shrink: 0; }
.optional { font-size: 0.72rem; color: #5a7a9a; }
.input-select, .input-text, .input-number {
  flex: 1; padding: 5px 8px; background: #151e30; border: 1px solid #2e3f60;
  border-radius: 5px; color: #d0e8ff; font-size: 0.85rem;
}
.input-number { width: 80px; flex: none; }
.stats-details { margin-top: 4px; }
.stats-details summary { cursor: pointer; font-size: 0.8rem; color: #7a9ab8; user-select: none; }
.stats-grid { padding: 8px 0; display: flex; flex-direction: column; gap: 6px; }
.stats-hint { font-size: 0.72rem; color: #5a7a9a; margin-top: 4px; }

/* ── ボタン ──────────────────────────────────────────── */
.btn {
  padding: 7px 16px; border: none; border-radius: 6px; cursor: pointer;
  font-size: 0.85rem; font-weight: 600; transition: all 0.15s;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary { background: #2a5a9c; color: #e8f4ff; }
.btn-primary:hover:not(:disabled) { background: #3a6ab0; }
.btn-danger-sm {
  padding: 3px 8px; background: transparent; border: 1px solid #6a2a2a;
  color: #c07070; border-radius: 4px; font-size: 0.75rem; cursor: pointer;
}
.btn-danger-sm:hover { background: #3a1a1a; }
.btn-secondary-sm {
  padding: 3px 8px; background: transparent; border: 1px solid #2a4a6a;
  color: #7ab0d0; border-radius: 4px; font-size: 0.75rem; cursor: pointer;
}
.btn-secondary-sm:hover { background: #1a2a3a; }
.ship-list-actions { display: flex; gap: 4px; align-items: center; }

/* ── 遠征選択タブ スクロール領域 ─────────────────────── */
.expedition-tab-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── 右パネルタブ ─────────────────────────────────────── */
.right-tabs { display: flex; gap: 4px; margin-bottom: 4px; }
.tab-count {
  display: inline-block; margin-left: 5px;
  background: #2a5a8c; color: #c8e8ff;
  font-size: 0.7rem; font-weight: 700;
  padding: 1px 6px; border-radius: 10px;
}

/* ── 登録済み艦娘パネル ───────────────────────────────── */
.panel-ships { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }

/* ── 登録数バー（左パネル下部） ─────────────────────── */
.ship-count-bar {
  margin-top: 8px; font-size: 0.8rem; color: #7a9ab8;
  padding: 6px 8px; background: #151e30; border-radius: 5px;
  border: 1px solid #253550;
}
.ship-count-hint { margin-left: 8px; color: #4a6a8a; font-size: 0.75rem; }
.btn-propose {
  background: linear-gradient(135deg, #1a5a4a, #2a7a60);
  color: #d0fff0; font-size: 0.9rem; padding: 8px 24px;
  border: none; border-radius: 6px; cursor: pointer; font-weight: 700;
  transition: all 0.15s;
}
.btn-propose:hover:not(:disabled) { background: linear-gradient(135deg, #2a6a5a, #3a8a70); }
.btn-propose:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── JSONインポート ──────────────────────────────────── */
.import-desc { font-size: 0.8rem; color: #7a9ab8; margin-bottom: 4px; }
.import-example {
  font-size: 0.72rem; background: #111824; border: 1px solid #2e3f60; border-radius: 4px;
  padding: 8px; color: #a0c8a0; margin-bottom: 8px; overflow-x: auto; white-space: pre;
}
.import-textarea {
  width: 100%; min-height: 100px; background: #151e30; border: 1px solid #2e3f60;
  border-radius: 5px; color: #d0e8ff; font-size: 0.8rem; padding: 8px; resize: vertical;
  font-family: monospace;
}
.error-msg { color: #e07070; font-size: 0.8rem; margin: 4px 0; }

/* ── 艦娘リスト ──────────────────────────────────────── */
.ship-list-header {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.8rem; color: #7a9ab8; margin: 8px 0 4px;
}
.ship-list { flex: 1; min-height: 0; overflow-y: scroll; overflow-x: hidden; overscroll-behavior: contain; }
.ship-list-inner { display: flex; flex-direction: column; gap: 3px; }
.empty-msg { text-align: center; color: #4a6a8a; font-size: 0.8rem; padding: 16px; }

/* ── 艦種アコーディオン ──────────────────────────────── */
.ship-type-group {
  border: 1px solid #253550; border-radius: 6px; overflow: hidden;
}
.ship-type-summary {
  display: flex; align-items: center; gap: 7px;
  padding: 5px 8px; background: #1a2640; cursor: pointer;
  list-style: none; user-select: none;
  font-size: 0.8rem;
}
.ship-type-summary::-webkit-details-marker { display: none; }
.ship-type-summary::before {
  content: '▶'; font-size: 0.6rem; color: #5a7a9a;
  transition: transform 0.15s; flex-shrink: 0;
}
details[open] > .ship-type-summary::before { transform: rotate(90deg); }
.ship-type-summary:hover { background: #202e4a; }
.summary-badge { flex-shrink: 0; }
.summary-count { color: #a0c0e0; font-weight: 600; }
.summary-excluded { color: #c0804a; font-size: 0.75rem; margin-left: auto; }

.ship-type-body {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 2px;
  padding: 4px;
  background: #141c2e;
}
.ship-item {
  display: flex; align-items: center; gap: 6px;
  background: #151e30; border: 1px solid #253550; border-radius: 4px; padding: 4px 8px;
  font-size: 0.8rem;
}
.ship-type-badge {
  padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;
  color: #fff; flex-shrink: 0;
}
.ship-type-badge.sm { font-size: 0.68rem; padding: 1px 5px; }
.ship-name { flex: 1; font-weight: 600; color: #c8e0ff; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ship-level { color: #a0b8d0; flex-shrink: 0; }
.ship-stats-mini { font-size: 0.7rem; color: #6a8aaa; flex-shrink: 0; }
.ship-no-stats { font-size: 0.7rem; color: #4a6070; font-style: italic; flex-shrink: 0; }
.btn-remove {
  background: none; border: none; color: #6a4a4a; cursor: pointer; font-size: 1rem;
  padding: 0 2px; line-height: 1; flex-shrink: 0;
}
.btn-remove:hover { color: #e07070; }

/* ── 大発バッジ ──────────────────────────────────────── */
.daihatsu-badge {
  flex-shrink: 0;
  font-size: 0.65rem; font-weight: 700;
  padding: 1px 5px; border-radius: 3px;
  background: rgba(80, 160, 100, 0.2);
  border: 1px solid #2a7a50;
  color: #60c080;
}
.daihatsu-mark {
  font-size: 0.62rem; font-weight: 700;
  padding: 1px 4px; border-radius: 3px;
  background: rgba(80, 160, 100, 0.15);
  border: 1px solid #2a7a50;
  color: #50b070;
  white-space: nowrap;
}

/* ── 除外トグル ──────────────────────────────────────── */
.excluded-count { color: #c0804a; font-size: 0.8rem; }

.ship-item--excluded {
  opacity: 0.45;
  text-decoration: line-through;
  text-decoration-color: #c0604a;
}
.ship-item--excluded .ship-type-badge { filter: grayscale(0.6); }

.btn-exclude {
  flex-shrink: 0;
  padding: 1px 6px;
  font-size: 0.7rem;
  border-radius: 3px;
  border: 1px solid #4a6070;
  background: none;
  color: #6a8090;
  cursor: pointer;
  line-height: 1.4;
  transition: all 0.15s;
}
.btn-exclude:hover { border-color: #c0804a; color: #c0804a; }
.btn-exclude--active {
  border-color: #c0604a;
  background: rgba(192, 96, 74, 0.15);
  color: #c0804a;
}
.btn-exclude--active:hover { border-color: #7aa8cc; color: #7aa8cc; background: none; }

/* ── 遠征選択 ──────────────────────────────────────── */
.expedition-groups { display: flex; flex-direction: column; gap: 10px; }
.exp-group-label {
  font-size: 0.75rem; font-weight: 700; color: #7a9ab8; text-transform: uppercase;
  letter-spacing: 0.05em; margin-bottom: 4px;
}
.exp-checkboxes { display: flex; flex-wrap: wrap; gap: 4px; }
.exp-checkbox-label {
  display: flex; align-items: center; gap: 5px; cursor: pointer;
  padding: 4px 8px; border: 1px solid #253550; border-radius: 5px;
  font-size: 0.8rem; background: #151e30; transition: all 0.12s;
  user-select: none;
}
.exp-checkbox-label:hover { border-color: #3a5a8c; background: #1a2840; }
.exp-checkbox-label:has(.exp-checkbox:checked) {
  border-color: #2a5a9c; background: #182040;
}
.exp-checkbox { width: 14px; height: 14px; accent-color: #3a7abc; }
.exp-id-badge {
  background: #2a3a5a; padding: 1px 6px; border-radius: 3px;
  font-size: 0.72rem; font-weight: 700; color: #8ab0e0;
}
.exp-name { color: #b0c8e0; }
.exp-duration { color: #5a7a9a; font-size: 0.75rem; margin-left: 2px; }

.propose-bar {
  display: flex; align-items: center; justify-content: flex-end; gap: 12px;
  margin-top: 12px; padding-top: 12px; border-top: 1px solid #2e3f60;
}
.selected-count { font-size: 0.8rem; color: #7a9ab8; }

/* ── 結果 ──────────────────────────────────────────── */
.panel-result { }
.unmatched-warning {
  background: #3a2a1a; border: 1px solid #7a5a2a; border-radius: 6px;
  padding: 8px 12px; font-size: 0.82rem; color: #e0b070; margin-bottom: 12px;
}
.result-list { display: flex; flex-direction: column; gap: 10px; }
.result-card {
  background: #151e30; border: 1px solid #253550; border-radius: 7px; padding: 12px;
}
.result-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.result-id-badge {
  background: #1a3a6a; padding: 2px 8px; border-radius: 4px;
  font-size: 0.8rem; font-weight: 700; color: #6ab0f0;
}
.result-name { flex: 1; font-weight: 700; color: #c8e0ff; }
.result-status-badge {
  padding: 3px 10px; border-radius: 4px; font-size: 0.78rem; font-weight: 600;
}
.status-ok  { background: #1a3a2a; color: #60d080; border: 1px solid #2a5a3a; }
.status-ng  { background: #3a1a1a; color: #e08060; border: 1px solid #6a2a2a; }
.status-unknown { background: #2a2a3a; color: #9090a0; border: 1px solid #3a3a5a; }

.result-fleet { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.result-ship {
  display: flex; align-items: center; gap: 4px;
  background: #1a2840; border: 1px solid #2a3a5a; border-radius: 5px; padding: 4px 8px;
  font-size: 0.8rem;
}
.flagship-mark {
  background: #8a6010; color: #f0d060; padding: 1px 5px; border-radius: 3px;
  font-size: 0.68rem; font-weight: 700;
}
.fleet-num {
  color: #5a7a9a; font-size: 0.75rem; width: 14px; text-align: center;
}
.result-ship-name { color: #c0d8f0; font-weight: 600; }
.result-ship-lv { color: #7a9ab8; font-size: 0.75rem; }

.stats-compare {
  display: flex; gap: 12px; flex-wrap: wrap;
  background: #111824; border-radius: 5px; padding: 8px 10px;
}
.stat-row { display: flex; flex-direction: column; align-items: center; min-width: 52px; }
.stat-label { font-size: 0.7rem; color: #6a8aaa; margin-bottom: 2px; }
.stat-value { font-size: 0.9rem; font-weight: 700; }
.stat-ok { color: #50d080; }
.stat-ng { color: #e06040; }
.stat-required { font-size: 0.7rem; font-weight: 400; opacity: 0.7; }
.stats-unknown { font-size: 0.78rem; color: #6a8090; font-style: italic; padding: 4px 0; }

/* ── 燃料・弾薬消費 ──────────────────────────────────────── */
.consumption-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 4px 6px;
  background: rgba(255,255,255,0.04);
  border-radius: 4px;
  font-size: 0.8rem;
}
.consumption-label { color: #7aa8cc; font-weight: 600; flex-shrink: 0; }
.consumption-fuel  { color: #e8c44a; font-weight: 700; }
.consumption-ammo  { color: #e07a50; font-weight: 700; }
.consumption-note  { color: #5a7090; font-size: 0.72rem; margin-left: auto; }

/* ── kc-web インポート ──────────────────────────────────── */
.kcweb-method { margin-bottom: 4px; }
.kcweb-method--alt {
  border: 1px solid #253550; border-radius: 6px; overflow: hidden;
}
.kcweb-method--alt > summary {
  padding: 6px 10px; background: #1a2640; cursor: pointer; list-style: none;
}
.kcweb-method--alt > summary::-webkit-details-marker { display: none; }
.kcweb-method--alt > summary::before {
  content: '▶'; font-size: 0.6rem; color: #5a7a9a; margin-right: 6px;
  transition: transform 0.15s; display: inline-block;
}
details[open].kcweb-method--alt > summary::before { transform: rotate(90deg); }
.kcweb-method--alt > summary:hover { background: #202e4a; }
details[open].kcweb-method--alt > .kcweb-steps,
details[open].kcweb-method--alt > .savedata-cmd,
details[open].kcweb-method--alt > .import-textarea,
details[open].kcweb-method--alt > .error-msg,
details[open].kcweb-method--alt > .status-msg,
details[open].kcweb-method--alt > .btn { padding: 8px 10px; }

.kcweb-method-title { font-size: 0.82rem; font-weight: 700; color: #a0c0e0; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.method-badge {
  font-size: 0.65rem; font-weight: 700; padding: 1px 6px; border-radius: 3px;
  background: rgba(60,160,100,0.2); border: 1px solid #2a7a50; color: #60c080;
}
.method-badge--alt {
  background: rgba(100,120,160,0.2); border-color: #3a5a8a; color: #7a9ab8;
}

.kcweb-steps { padding-left: 18px; margin: 0; display: flex; flex-direction: column; gap: 8px; font-size: 0.8rem; color: #a0b8d0; }
.kcweb-steps li { line-height: 1.5; }
.step-sub { margin-top: 4px; padding-left: 16px; display: flex; flex-direction: column; gap: 2px; color: #7a9ab8; }
.step-note { margin-top: 4px; font-size: 0.72rem; color: #7a8a6a; }
kbd {
  display: inline-block; padding: 0 5px; background: #1a2a3a; border: 1px solid #3a5a7a;
  border-radius: 3px; font-family: monospace; font-size: 0.75rem; color: #90b8d8;
}

.bookmarklet-wrap { display: flex; align-items: center; gap: 8px; margin: 8px 0 4px; }
.bookmarklet-link {
  display: inline-block; padding: 5px 12px;
  background: linear-gradient(135deg, #1a4a7a, #2a6aaa);
  border: 1px solid #3a7aca; border-radius: 5px;
  color: #d0eaff; font-size: 0.82rem; font-weight: 700;
  text-decoration: none; cursor: grab; user-select: none;
  transition: all 0.15s;
}
.bookmarklet-link:hover { background: linear-gradient(135deg, #2a5a8a, #3a7aba); }
.bookmarklet-hint { font-size: 0.72rem; color: #5a8ab0; }

.savedata-cmd {
  display: block; font-size: 0.68rem; background: #111824; border: 1px solid #2e3f60;
  border-radius: 4px; padding: 6px 8px; color: #a0c8a0; overflow-x: auto;
  white-space: pre; margin: 6px 0; font-family: monospace;
}
.mt-8 { margin-top: 8px; }


.snippet-container {
  position: relative; margin-bottom: 8px;
}
.snippet-code {
  font-size: 0.65rem; background: #111824; border: 1px solid #2e3f60;
  border-radius: 4px; padding: 8px 36px 8px 8px; color: #80b080;
  overflow-x: auto; white-space: pre; max-height: 160px; overflow-y: auto;
  font-family: monospace; line-height: 1.4;
}
.btn-copy {
  position: absolute; top: 6px; right: 6px;
  background: #2a3a5a; border: 1px solid #3a5a8c; color: #8ab0e0;
  border-radius: 4px; font-size: 0.72rem; padding: 2px 8px; cursor: pointer;
  transition: all 0.15s;
}
.btn-copy:hover { background: #3a5a8c; }
.import-divider {
  text-align: center; margin: 10px 0; position: relative;
  color: #4a6a8a; font-size: 0.78rem;
}
.import-divider::before {
  content: ''; position: absolute; left: 0; top: 50%;
  width: 100%; height: 1px; background: #2e3f60;
}
.import-divider span { background: #1e2840; padding: 0 8px; position: relative; }
.status-msg { color: #70b090; font-size: 0.8rem; margin: 4px 0; }

/* ── フッター ──────────────────────────────────────────── */
.app-footer {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding: 10px 20px;
  background: #0d1520;
  border-top: 1px solid #1e2e48;
  font-size: 0.72rem;
}
.footer-label { color: #4a6a8a; font-weight: 600; margin-right: 2px; }
.footer-sep { color: #2a3a50; }
.footer-link {
  color: #5a8ab0; text-decoration: none;
  transition: color 0.15s;
}
.footer-link:hover { color: #8abce0; text-decoration: underline; }
</style>
