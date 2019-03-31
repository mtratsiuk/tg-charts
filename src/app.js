export function init (node, data) {
  const state = {
    ...getInitialState(data),
    width: node.offsetWidth,
    chartsHeight: Math.min(node.offsetWidth / 1.5, node.offsetHeight / 2)
  }

  const [html, subs] = view(state)
  node.innerHTML = html

  const listeners = {
    click: []
  }

  subs.forEach(s => {
    listeners[s.event].push(s)
  })

  Object.keys(listeners).forEach(event => {
    node.addEventListener(event, e => {
      const { message } = listeners[event].find(({ id }) => id === e.target.id) || {}

      if (message) {
        patch(message)
      }
    })
  })

  function patch (message) {
    const [slice, effect] = update(state, message)
    Object.assign(state, slice)

    const [html] = view(state)
    node.innerHTML = html

    if (effect) {
      effect(patch)
    }
  }
}

function update (state, message) {
  const { type, payload } = message

  switch (type) {
    case TOGGLE_CHART: {
      const id = payload

      const nextVisibleChartIds = state.visibleChartIds.includes(id)
        ? state.visibleChartIds.filter(vId => vId !== id)
        : state.visibleChartIds.concat(id)

      const shouldAnimate = nextVisibleChartIds.length !== 0 && state.visibleChartIds.length !== 0

      const slice = {
        visibleChartIds: nextVisibleChartIds,
        transition: shouldAnimate
          ? {
            progress: 0,
            initialRange: getBoundaries(getVisibleCharts(state))
          }
          : null
      }

      const effect = shouldAnimate
        ? patch => {
          window.requestAnimationFrame(time => patch(createMessage(TOGGLE_CHART_STEP, { start: time, time })))
        }
        : null

      return [slice, effect]
    }

    case TOGGLE_CHART_STEP: {
      const TRANSITION_TIME = 500
      const { start, time } = payload

      const progress = Math.min((time - start) / TRANSITION_TIME, 1)

      const slice = {
        transition: {
          ...state.transition,
          progress
        }
      }

      const effect =
        progress === 1
          ? null
          : patch => window.requestAnimationFrame(time => patch(createMessage(TOGGLE_CHART_STEP, { start, time })))

      return [slice, effect]
    }
  }

  throw new Error(`Unexpected message: ${message.type}`)
}

function view (state) {
  const { unwrap, wrap } = v()

  const html = `
    <div>
      ${unwrap(viewCharts(state))}
      ${unwrap(viewButtons(state))}
    </div>
  `

  return wrap(html)
}

function viewCharts (state) {
  const width = getChartsWidth(state)
  const height = getChartsHeight(state)
  const charts = getVisibleCharts(state)

  return `
    <div class="charts">
      <svg width="${width}" height="${height}" viewBox="0 -${height} ${width} ${height}">
        ${charts.map(c => viewPolyline(state, c)).join('')}
      </svg>
    </div>
  `
}

function viewPolyline (state, { id, values, color }) {
  const timeline = getScaledTimeline(state)
  const scale = getValuesScaler(state)
  const points = timeline.map((t, i) => `${t},-${scale(values[i])}`).join(' ')

  return `
    <polyline points="${points}" fill="none" stroke="${color}" id="${id}" />
  `
}

function viewButtons (state) {
  const { wrap } = v()
  const charts = getCharts(state)
  const getId = id => `${id}-button`

  const html = `
      <div>
        ${charts.map(({ name, color, id }) => `<button id="${getId(id)}">${name}</button>`).join('')}
      </div>
    `

  const subs = charts.map(({ id }) => onClick(getId(id), createMessage(TOGGLE_CHART, id)))

  return wrap(html, subs)
}

function v () {
  const subs = []

  return {
    wrap (html, s) {
      return [html, subs.concat(s || [])]
    },
    unwrap (view) {
      if (!Array.isArray(view)) {
        return view
      }

      subs.push(...view[1])

      return view[0]
    }
  }
}

function onClick (id, message) {
  return {
    id,
    message,
    event: 'click'
  }
}

function createMessage (type, payload) {
  return {
    type,
    payload
  }
}

const TOGGLE_CHART = 'TOGGLE_CHART'
const TOGGLE_CHART_STEP = 'TOGGLE_CHART_STEP'

function getInitialState (data) {
  const TIMELINE_ID = 'x'

  const timeline = data.columns.find(([id]) => id === TIMELINE_ID).slice(1)
  const charts = data.columns
    .filter(([id]) => id !== TIMELINE_ID)
    .map(([id, ...values]) => {
      return {
        id,
        values,
        color: data.colors[id],
        name: data.names[id]
      }
    })

  const visibleRange = [0, timeline.length - 1]
  const visibleChartIds = charts.map(({ id }) => id)

  return {
    timeline,
    charts,
    visibleChartIds,
    visibleRange
  }
}

const getCharts = state => state.charts
const getTimeline = state => state.timeline
const getVisibleChartIds = state => state.visibleChartIds
const getVisibleRange = state => state.visibleRange
const getChartsHeight = state => state.chartsHeight
const getChartsWidth = state => state.width
const getTransition = state => state.transition

const getVisibleCharts = selector([getCharts, getVisibleChartIds], (charts, visibleChartIds) =>
  charts.filter(({ id }) => visibleChartIds.includes(id))
)

const getValuesScaler = selector([getVisibleCharts, getChartsHeight, getTransition], (charts, height, transition) => {
  if (!transition) {
    return createScaler(getBoundaries(charts), [0, height])
  }

  const { initialRange, progress } = transition
  const targetRange = getBoundaries(charts)

  const range = [
    initialRange[0] + (targetRange[0] - initialRange[0]) * progress,
    initialRange[1] + (targetRange[1] - initialRange[1]) * progress
  ]

  return createScaler(range, [0, height])
})

const getTimelineScaler = selector([getTimeline, getVisibleRange, getChartsWidth], (timeline, range, width) =>
  createScaler([timeline[range[0]], timeline[range[1]]], [0, width])
)

const getScaledTimeline = selector([getTimeline, getTimelineScaler], (timeline, scale) => timeline.map(scale))

function getBoundaries (charts) {
  let min = Number.MAX_VALUE
  let max = Number.MIN_VALUE

  charts.forEach(({ values }) => {
    values.forEach(v => {
      if (v < min) {
        min = v
      }

      if (v > max) {
        max = v
      }
    })
  })

  return [min, max]
}

function createScaler (range, newRange) {
  const coef = (newRange[1] - newRange[0]) / (range[1] - range[0])
  const offset = newRange[0] - range[0]

  return function (x) {
    return Math.max((x + offset) * coef, 0)
  }
}

function selector (deps, f) {
  let cache
  let prevArgs

  return function (state) {
    const args = deps.map(d => d(state))

    if (prevArgs && prevArgs.every((a, i) => a === args[i])) {
      return cache
    }

    prevArgs = args
    cache = f(...args)

    return cache
  }
}

// eslint-disable-next-line
function tap (name) {
  return function (f) {
    return function (...args) {
      console.log(name)
      console.log('Args:', args)
      const res = f(...args)
      console.log('Res:', res)
      return res
    }
  }
}
