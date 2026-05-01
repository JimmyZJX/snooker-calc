import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

// ─── Snooker constants ───────────────────────────────────────────────────────

const COLORS = [
  { name: 'Yellow', value: 2, bg: '#F5C800', fg: '#1a1a1a' },
  { name: 'Green',  value: 3, bg: '#00A550', fg: '#fff'    },
  { name: 'Brown',  value: 4, bg: '#7B3F00', fg: '#fff'    },
  { name: 'Blue',   value: 5, bg: '#0047AB', fg: '#fff'    },
  { name: 'Pink',   value: 6, bg: '#E75480', fg: '#fff'    },
  { name: 'Black',  value: 7, bg: '#222222', fg: '#fff'    },
]
const DISPLAY_COLORS = [...COLORS].reverse()

const RED   = { name: 'Red',   value: 1, bg: '#CC0000', fg: '#fff' }
const BLACK = COLORS[5]
const MAX_SCORE = 149

function getColorByName(name) {
  return COLORS.find(color => color.name === name) ?? BLACK
}

function clampScore(score) {
  return Math.max(0, Math.min(MAX_SCORE, score))
}

// ─── Pure logic ──────────────────────────────────────────────────────────────

/**
 * Maximum points still available from this position.
 * With r reds: r × (red 1 + black 7 = 8) + all colours (27) → 8r + 27.
 * Colours phase: sum of remaining colours.
 */
function calcRemaining(phase, reds, nextColor) {
  if (phase === 'done') return 0
  if (phase === 'reds') return 8 * reds + 27
  const i = COLORS.findIndex(c => c.name === nextColor)
  return COLORS.slice(i).reduce((s, c) => s + c.value, 0)
}

/**
 * Optimal potting sequence for the trailing player.
 * Reds phase → red + black per pair, then all colours.
 * Colours phase → remaining colours in order.
 */
function buildSequence(phase, reds, nextColor, redColorName) {
  if (phase === 'reds') {
    const redColor = getColorByName(redColorName)
    const pairs = Array.from({ length: reds }, () => [
      { ...RED, shotType: 'red' },
      { ...redColor, shotType: 'red-color' },
    ]).flat()
    return [...pairs, ...COLORS.map(color => ({ ...color, shotType: 'clearance-color' }))]
  }
  if (phase === 'done') return []
  const i = COLORS.findIndex(c => c.name === nextColor)
  return COLORS.slice(i).map(color => ({ ...color, shotType: 'clearance-color' }))
}

/**
 * Walk the potting sequence for Player 1.
 * At each ball, check whether P1's new total > P2's max possible
 * (= P2's current score + every remaining point after this pot).
 *
 * Condition: p1 + cum > p2 + (totalRemaining − cum)
 *            ↔  2·cum > p2 − p1 + totalRemaining
 */
function ballsToMathWin(sequence, p1Score, p2Score, totalRemaining, options) {
  const { alreadyWon = false, initialReds = 0, redColorName = 'Black' } = options
  let cum = 0
  let hasWon = alreadyWon
  let redsLeft = initialReds
  let opponentRemaining = totalRemaining
  const out = []
  for (const [index, ball] of sequence.entries()) {
    cum += ball.value

    let nextReds = redsLeft
    let nextColor = redsLeft > 0 ? 'Yellow' : null

    if (ball.shotType === 'red') {
      opponentRemaining = Math.max(0, opponentRemaining - 8)
      redsLeft = Math.max(0, redsLeft - 1)
      nextReds = redsLeft
      nextColor = redsLeft === 0 ? redColorName : 'Yellow'
    } else if (ball.shotType === 'red-color') {
      nextReds = redsLeft
      nextColor = redsLeft === 0 ? 'Yellow' : 'Yellow'
    } else {
      opponentRemaining = Math.max(0, opponentRemaining - ball.value)
      nextReds = 0
      nextColor = sequence[index + 1]?.shotType === 'clearance-color'
        ? sequence[index + 1].name
        : null
    }

    const p2Remaining = opponentRemaining
    const p1Total      = p1Score + cum
    const p2Max        = p2Score + p2Remaining
    const isWinning    = !alreadyWon && !hasWon && p1Total > p2Max
    const isAfterWin   = hasWon
    out.push({
      ...ball,
      cum,
      p1Total,
      p2Score,
      p2Remaining,
      p2Max,
      isWinning,
      isAfterWin,
      nextReds,
      nextColor,
    })
    if (isWinning) hasWon = true
  }
  return out
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Ball({ ball, size = 42 }) {
  return (
    <span
      className="ball"
      style={{
        width: size, height: size,
        background: ball.bg, color: ball.fg,
        fontSize: size * 0.33,
      }}
    >
    </span>
  )
}

function ScorePanel({ label, score, onScoreChange }) {
  const dragRef = useRef({ active: false, pointerId: null, startY: 0, startScore: score })
  const scrubberRef = useRef(null)
  const nudgeSteps = [1, 5, 10]

  function adjustScore(delta) {
    onScoreChange(clampScore(score + delta))
  }

  function beginScrub(event) {
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startY: event.clientY,
      startScore: score,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function moveScrub(event) {
    if (!dragRef.current.active) return
    const distance = event.clientY - dragRef.current.startY
    const delta = Math.trunc(distance / 10)
    onScoreChange(clampScore(dragRef.current.startScore + delta))
  }

  function endScrub(event) {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  useEffect(() => {
    function handleWheel(event) {
      const element = scrubberRef.current
      if (!element || !(event.target instanceof Node) || !element.contains(event.target)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      onScoreChange(currentScore => clampScore(currentScore + (event.deltaY > 0 ? 1 : -1)))
    }

    document.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    return () => {
      document.removeEventListener('wheel', handleWheel, { capture: true })
    }
  }, [onScoreChange])

  return (
    <div className="score-panel">
      <div className="score-panel__label">{label}</div>

      <div className="score-scrubber" ref={scrubberRef}>
        <div className="score-nudge-stack">
          {[10, 5, 1].map(step => (
            <button
              key={`down-${step}`}
              type="button"
              className="score-nudge"
              onClick={() => adjustScore(-step)}
              aria-label={`Decrease ${label} by ${step}`}
            >
              -{step}
            </button>
          ))}
        </div>

        <div
          className="score-surface"
          onPointerDown={beginScrub}
          onPointerMove={moveScrub}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
        >
          <div className="score-panel__value">{score}</div>
          <div className="score-surface__hint" aria-hidden="true">↕</div>
        </div>

        <div className="score-nudge-stack">
          {nudgeSteps.map(step => (
            <button
              key={`up-${step}`}
              type="button"
              className="score-nudge"
              onClick={() => adjustScore(step)}
              aria-label={`Increase ${label} by ${step}`}
            >
              +{step}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main app ────────────────────────────────────────────────────────────────

export default function App() {
  const [p1, setP1] = useState(0)
  const [p2, setP2] = useState(0)

  // Table state
  const [reds,      setReds]      = useState(15)
  const [nextColor, setNextColor] = useState('Yellow')
  const [redColorName, setRedColorName] = useState('Black')
  const phase = reds > 0 ? 'reds' : nextColor ? 'colors' : 'done'

  const remaining = useMemo(
    () => calcRemaining(phase, reds, nextColor),
    [phase, reds, nextColor],
  )

  const sequence = useMemo(
    () => buildSequence(phase, reds, nextColor, redColorName),
    [phase, reds, nextColor, redColorName],
  )

  // Math-win states from Player 1's perspective:
  //   p1AlreadyWon  — P1 already > P2 + remaining  (P2 can't catch up)
  //   p2HasWon      — P1 + remaining < P2           (P1 can't catch up)
  //   canWin        — P1 can reach math-win by potting optimally
  const p1AlreadyWon = p1 > p2 + remaining
  const p2HasWon     = p1 + remaining < p2
  const frameDecided = p1AlreadyWon || p2HasWon

  const balls = useMemo(
    () => ballsToMathWin(sequence, p1, p2, remaining, {
      alreadyWon: frameDecided,
      initialReds: reds,
      redColorName,
    }),
    [sequence, p1, p2, remaining, frameDecided, reds, redColorName],
  )

  function advanceToRow(row) {
    setP1(row.p1Total)
    setReds(row.nextReds)
    setNextColor(row.nextColor)
  }

  function renderRedCell(realIndex, key) {
    const isReal = realIndex < 15
    const isOn = isReal && realIndex < reds
    return (
      <button
        key={key}
        type="button"
        className={`board-red ${isOn ? 'board-red--on' : ''} ${!isReal ? 'board-red--ghost' : ''}`}
        onClick={() => isReal && setReds(realIndex + 1)}
        aria-label={isReal ? `${realIndex + 1} reds left` : undefined}
        disabled={!isReal}
      />
    )
  }

  return (
    <div className="app">
      <h1 className="app-title">Snooker Calc</h1>

      {/* ── Table state ── */}
      <section className="card">
        <div className="card__title">Table State</div>

        <div className="table-board">
          <div className="board-row board-row--colors" role="group" aria-label="Colours order">
            {DISPLAY_COLORS.map(color => {
              const colorIndex = COLORS.findIndex(item => item.name === color.name)
              const nextIndex = COLORS.findIndex(item => item.name === nextColor)
              const isSelected = phase === 'colors' && nextColor === color.name
              const isGone = phase === 'colors' && colorIndex < nextIndex
              return (
                <button
                  key={color.name}
                  type="button"
                  className={`board-color ${isSelected ? 'board-color--selected' : ''} ${isGone ? 'board-color--gone' : ''}`}
                  style={{ background: color.bg, color: color.fg }}
                  onClick={() => {
                    setReds(0)
                    setNextColor(color.name)
                  }}
                  aria-label={`Next colour ${color.name}`}
                >
                  {color.value}
                </button>
              )
            })}

            {Array.from({ length: 6 }, (_, index) => (
              <span key={`color-empty-${index}`} className="board-empty-slot" aria-hidden="true" />
            ))}
          </div>

          <div className="board-row board-row--reds-top" role="group" aria-label="Reds remaining row one">
            {Array.from({ length: 5 }, (_, index) => renderRedCell(index, `red-top-left-${index}`))}
            <span className="board-gap-slot" aria-hidden="true" />
            {Array.from({ length: 5 }, (_, offset) => renderRedCell(offset + 5, `red-top-right-${offset}`))}
            <span className="board-empty-slot" aria-hidden="true" />
          </div>

          <div className="board-row board-row--reds-bottom" role="group" aria-label="Reds remaining row two">
            {Array.from({ length: 5 }, (_, offset) => renderRedCell(offset + 10, `red-bottom-left-${offset}`))}
            <span className="board-gap-slot" aria-hidden="true" />
            <div className="board-info board-info--inline">
              {phase === 'reds' ? `${reds} red${reds === 1 ? '' : 's'} left` : `${nextColor} ${COLORS.find(color => color.name === nextColor)?.value ?? ''}`}
            </div>
          </div>
        </div>
      </section>

      {/* ── Scores ── */}
      <section className="card">
        <div className="scores-row">
          <ScorePanel
            label="Player 1"
            score={p1}
            onScoreChange={setP1}
          />
          <button
            type="button"
            className="swap-btn"
            onClick={() => {
              const oldP1 = p1
              setP1(p2)
              setP2(oldP1)
            }}
            aria-label="Swap players"
          >
            ⇄
          </button>
          <ScorePanel
            label="Player 2"
            score={p2}
            onScoreChange={setP2}
          />
        </div>

        <div className={`red-color-row ${phase !== 'reds' ? 'red-color-row--inactive' : ''}`}>
          <span className="red-color-row__label">Red +</span>
          <div className="red-color-row__choices" role="group" aria-label="Colour after red">
            {DISPLAY_COLORS.map(color => (
              <button
                key={color.name}
                type="button"
                className={`red-color-choice ${redColorName === color.name ? 'red-color-choice--selected' : ''}`}
                style={{ background: color.bg, color: color.fg }}
                onClick={() => setRedColorName(color.name)}
                aria-label={`Play ${color.name} with red`}
              >
                {color.value}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Result ── */}
      <section className="card result-card">
        <div className="table-status">
          <span className={`table-status__val ${p1 > p2 ? 'table-status__val--p1' : p2 > p1 ? 'table-status__val--p2' : ''}`}>
            {p1 >= p2 ? 'Ahead' : 'Behind'}&nbsp;{Math.abs(p1 - p2)}
          </span>
          <span className="table-status__sep">·</span>
          <span className="table-status__val">Remaining {remaining}</span>
        </div>
        <div className="divider" />

          <div className="comeback">
            <div className="scores-header">
              <span className="scores-header__spacer" />
              <span className="scores-header__p1">P1</span>
              <span className="scores-header__sep" />
              <span className="scores-header__p2">P2 max</span>
            </div>

            <div className="ball-list">
              {balls.map((b, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => advanceToRow(b)}
                  className={`ball-item ${b.isWinning ? 'ball-item--win' : ''} ${b.isAfterWin ? 'ball-item--after-win' : ''}`}
                >
                  <Ball ball={b} size={26} />
                  <span className="ball-item__name">{b.name}</span>
                  <span className="ball-item__pts">+{b.value}</span>
                  <div className="ball-item__scores">
                    <span className="ball-item__p1score">{b.p1Total}</span>
                    <span className={`ball-item__p2max ${b.isWinning ? 'ball-item__p2max--beaten' : ''} ${b.isAfterWin ? 'ball-item__p2max--after-win' : ''}`}>
                      <span className="p2max__base">{b.p2Score}</span>
                      <span className="p2max__plus">+{b.p2Remaining}</span>
                      <span className="p2max__eq">{b.p2Max}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>

          </div>
      </section>
    </div>
  )
}
