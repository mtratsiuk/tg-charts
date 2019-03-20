import charts from './data/chart_data.json'

import './src/app.css'
import { init } from './src/app'

init(document.getElementById('root'), charts[4])
