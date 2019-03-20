export function init (node, data) {
  const domState = {
    width: node.offsetWidth,
    chartsHeight: Math.min(node.offsetWidth / 1.5, node.offsetHeight / 2)
  }
  const state = getInitialState(data)

  const model = render(state, domState)

  const [html, subs] = view(model, domState)
  node.innerHTML = html

  const listeners = {
    click: []
  }

  subs.forEach(s => {
    listeners[s.event].push(s)
  })

  Object.keys(listeners).forEach(event => {
    node.addEventListener(event, e => {
      const { handler } = listeners[event].find(({ id }) => id === e.target.id)

      if (handler) {
        handler(patch)
      }
    })
  })

  function patch (update) {
    Object.assign(state, update(state))

    const model = render(state, domState)

    const [html] = view(model, domState)
    node.innerHTML = html
  }
}

function view (model, domState) {
  const { unwrap, wrap } = v()

  const html = `
    <div>
      ${unwrap(viewCharts(model, domState))}
      ${unwrap(viewButtons(model))}
    </div>
  `

  return wrap(html)
}

function viewCharts ({ charts }, { width, chartsHeight }) {
  return `
    <div class="charts">
      <svg width="${width}" height="${chartsHeight}" viewBox="0 -${chartsHeight} ${width} ${chartsHeight}">
        ${charts.map(viewPolyline).join('')}
      </svg>
    </div>
  `
}

function viewPolyline ({ id, points, color }) {
  return `
    <polyline points="${points}" fill="none" stroke="${color}" id="${id}" />
  `
}

function viewButtons ({ buttons }) {
  const { wrap } = v()

  const getId = id => `${id}-button`

  const html = `
      <div>
        ${buttons
    .map(
      ({ name, color, id }) =>
        `<button id="${getId(id)}">${name}</button>`
    )
    .join('')}
      </div>
    `

  const subs = buttons.map(({ id }) =>
    onClickSub(getId(id), patch =>
      patch(state => ({
        visibleChartIds: state.visibleChartIds.includes(id)
          ? state.visibleChartIds.filter(vId => vId !== id)
          : state.visibleChartIds.concat(id)
      }))
    )
  )

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

function onClickSub (id, handler) {
  return {
    id,
    handler,
    event: 'click'
  }
}

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

function render (
  { timeline, charts, visibleChartIds, visibleRange },
  { width, chartsHeight }
) {
  const visibleCharts = getVisibleCharts(charts, visibleChartIds)

  const scaleValues = createScaler(getBoundaries(visibleCharts), [
    0,
    chartsHeight
  ])
  const scaleTimeline = createScaler(
    [timeline[visibleRange[0]], timeline[visibleRange[1]]],
    [0, width]
  )

  const scaledTimeline = timeline.map(scaleTimeline)

  return {
    charts: visibleCharts.map(c =>
      renderPolyline({ ...c, timeline: scaledTimeline, scale: scaleValues })
    ),
    buttons: charts.map(c => renderButton({ ...c, visibleChartIds }))
  }
}

function renderPolyline ({ id, name, values, color, scale, timeline }) {
  return {
    points: timeline.map((t, i) => `${t},-${scale(values[i])}`).join(' '),
    color,
    id,
    name
  }
}

function renderButton ({ id, name, color, visibleChartIds }) {
  return {
    id,
    name,
    color,
    isChecked: visibleChartIds.includes(id)
  }
}

function getVisibleCharts (charts, visibleChartIds) {
  return charts.filter(({ id }) => visibleChartIds.includes(id))
}

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
    return (x + offset) * coef
  }
}
