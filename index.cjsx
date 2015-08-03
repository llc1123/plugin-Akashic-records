remote = require 'remote'
windowManager = remote.require './lib/window'

window.akashicRecordsWindow = null
initialAkashicRecordsWindow = ->
  if config.get "plugin.Akashic.forceMinimize", false
    forceMinimize = true
  else
    forceMinimize = false
  window.akashicRecordsWindow = windowManager.createWindow
    x: config.get 'poi.window.x', 0
    y: config.get 'poi.window.y', 0
    width: 820
    height: 650
    forceMinimize: forceMinimize
  window.akashicRecordsWindow.loadUrl "file://#{__dirname}/index.html"
  if process.env.DEBUG?
    window.akashicRecordsWindow.openDevTools
      detach: true

checkAkashicRecordsCrashed = ->
  if window.akashicRecordsWindow.isCrashed() and config.get('plugin.Akashic.enable', true)
    window.akashicRecordsWindow.destroy()
    initialAkashicRecordsWindow()

if config.get('plugin.Akashic.enable', true)
  initialAkashicRecordsWindow()
  # setInterval checkAkashicRecordsCrashed, 2000

module.exports =
  name: 'Akashic'
  priority: 10
  displayName: <span><FontAwesome key={0} name='book' /> 航海日志</span>
  description: '日志. 战果部分 by rui'
  author: 'W.G.'
  link: 'https://github.com/JenningsWu'
  version: '1.2.0'
  handleClick: ->
    # checkAkashicRecordsCrashed()
    window.akashicRecordsWindow.show()
