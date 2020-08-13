const { config } = window
import CONST from '../lib/constant'
import { initializeLogs, addLog } from './actions'
import _ from 'lodash'

import dataCoManager from '../lib/data-co-manager'

import { store } from 'views/create-store'

const judgeIfDemage = (nowHp, beforeHp) => {
  return nowHp.some((hp, i) => hp < beforeHp[i])
}

const judgeDanger = (nowHp, deckShipId, _ships) => {
  let dangerInfo = ''
  deckShipId.forEach((id, i) => {
    if (id === -1) return
    if (nowHp[i] / _ships[id].api_maxhp < 0.250001) {
      dangerInfo = `${dangerInfo}${dangerInfo === '' ? '' : ' & '}`
      dangerInfo = `${dangerInfo}${_ships[id].api_name}`
    }
  })
  if (process.env.DEBUG) console.log("战斗结束后剩余HP：#{JSON.stringify nowHp}")
  return dangerInfo
}

const timeToBString = (time) => {
  const date = new Date(time)
  return `${date.getFullYear()}${date.getMonth()}${date.getDate()}${date.getHours()}`
}

const seikuText = ['制空均衡','制空権確保','航空優勢','航空劣勢','制空権喪失']
const lostKindText = [
  '空襲により備蓄資源に損害を受けました！',
  '空襲により備蓄資源に損害を受け、基地航空隊にも地上撃破の損害が発生しました！',
  '空襲により基地航空隊に地上撃破の損害が発生しました！',
  '空襲による基地の損害はありません。',
]


class APIResolver {
  constructor(store) {
    this.compatible = true
    this.store = store
    this.nickNameId = config.get('plugin.Akashic.nickNameId', 0)
    this.nowDate = 0
    this.enableRecord = false
    this.isStart = true
    this._ships = []
    this.timeString = 'INIT'
    this.mapLv = []
    this.battleStart = false

    this.createShipFlag = false   //注意！之后要用config处理关于建造中正好猫了导致log数据遗失的问题！
    this.largeFlag = false
    this.material = []
    this.kdockId = 0
  }

  initializeLogs() {
    dataCoManager.initializeData(this.nickNameId).then((data) => {
      for (const type of Object.keys(data)) {
        this.store.dispatch(initializeLogs(data[type], type))
      }
      this.timeString = data.resource.length > 0 ? timeToBString(data.resource[0][0]) : ''
    })
  }

  updateUser(forceUpdateLogs = false) {
    if ((window._nickNameId && this.nickNameId !== window._nickNameId) ||
      forceUpdateLogs) {
      this.nickNameId = window._nickNameId
      config.set('plugin.Akashic.nickNameId', this.nickNameId)
      dataCoManager.setNickNameId(this.nickNameId)
      this.initializeLogs()
    }
  }

  start() {
    window.addEventListener('game.request', this.handleRequest)
    window.addEventListener('game.response', this.handleResponse)
    window.addEventListener('battle.result', this.handleBattleResultResponse)
    this.updateUser(true)
  }

  stop() {
    window.removeEventListener('game.request', this.handleRequest)
    window.removeEventListener('game.response', this.handleResponse)
    window.removeEventListener('battle.result', this.handleBattleResultResponse)
  }

  handleRequest = (e) => {
    const { body } = e.detail
    const urlpath = e.detail.path
    switch (urlpath) {
    // 解体
    case '/kcsapi/api_req_kousyou/destroyship': {
      const _ships = window._ships
      const $shiptypes = window.$shipTypes
      let dateTime = new Date().getTime()
      for (const shipId of body.api_ship_id.split(',')) {
        const dataItem = [
          dateTime++,
          '解体',
          $shiptypes[_ships[shipId].api_stype].api_name,
          `${_ships[shipId].api_name}(Lv.${_ships[shipId].api_lv})`,
        ]
        dataCoManager.saveLog('retirement', dataItem)
        this.store.dispatch(addLog(dataItem, 'retirement'))
      }
      break
    }

    // 改修
    case '/kcsapi/api_req_kaisou/powerup': {
      const { api_id_items } = e.detail.body
      const _ships = window._ships
      const $shiptypes = window.$shipTypes
      let dateTime = new Date().getTime()
      // Read the status before modernization
      for (const shipId of api_id_items.split(',')) {
        const dataItem = [
          dateTime++,
          '改修',
          $shiptypes[_ships[shipId].api_stype].api_name,
          `${_ships[shipId].api_name}(Lv.${_ships[shipId].api_lv})`,
        ]
        dataCoManager.saveLog('retirement', dataItem)
        this.store.dispatch(addLog(dataItem, 'retirement'))
      }
      break
    }
    }
  }

  handleResponse = (e) => {
    const { body, postBody } = e.detail
    const urlpath = e.detail.path
    switch (urlpath) {
    case '/kcsapi/api_get_member/basic':
      this.updateUser()
      break

      // Map selected rank
    case '/kcsapi/api_get_member/mapinfo':
      for (const map of body.api_map_info) {
        this.mapLv[map.api_id] = 0
        if (map.api_eventmap)
          this.mapLv[map.api_id] = map.api_eventmap.api_selected_rank
      }
      break

      // Eventmap select report
    case '/kcsapi/api_req_map/select_eventmap_rank':
      this.mapLv[parseInt(postBody.api_maparea_id) * 10 + parseInt(postBody.api_map_no)] = parseInt(postBody.api_rank)
      break

    case '/kcsapi/api_req_map/start':
    case '/kcsapi/api_req_map/next': {
      if (urlpath === '/kcsapi/api_req_map/start') {
        this.isStart = true
      }
      this._ships = window._ships
      this.nowDate = new Date().getTime()
      this.battleStart = false
      const { api_destruction_battle } = body
      if (api_destruction_battle != null) {
        const { api_air_base_attack } = api_destruction_battle
        const parsed_api_air_base_attack =
          typeof api_air_base_attack === 'string'
            ? JSON.parse(api_air_base_attack)
            : api_air_base_attack

        const map = parseInt(window.getStore('sortie.sortieMapId'), 10) || 0
        const quest = window.getStore('const.$maps')[map]?.api_name || ''
        const mapText = map <= 410
          ? `${quest}(${Math.floor(map / 10)}-${map % 10})`
          : `${quest}(${Math.floor(map / 10)}-${map % 10} %rank) | ${this.mapLv[map] || 0}`

        const seiku = seikuText[parsed_api_air_base_attack.api_stage1.api_disp_seiku] || ''
        const lostKind = lostKindText[api_destruction_battle.api_lost_kind - 1] || ''

        const dataItem = [this.nowDate,mapText,'基地防空戦', seiku, lostKind, '','','','','','','']
        dataCoManager.saveLog(CONST.typeList.attack, dataItem)
        this.store.dispatch(addLog(dataItem, CONST.typeList.attack))
      }
      break
    }

    case '/kcsapi/api_req_sortie/battle':
    case '/kcsapi/api_req_battle_midnight/sp_midnight':
    case '/kcsapi/api_req_sortie/airbattle':
    case '/kcsapi/api_req_battle_midnight/battle':
    case '/kcsapi/api_req_combined_battle/airbattle':
    case '/kcsapi/api_req_combined_battle/ld_airbattle':
    case '/kcsapi/api_req_combined_battle/battle':
    case '/kcsapi/api_req_combined_battle/midnight_battle':
    case '/kcsapi/api_req_combined_battle/sp_midnight':
    case '/kcsapi/api_req_combined_battle/battle_water':
      if (!this.battleStart) {
        this._ships = window._ships
        this.nowDate = (new Date()).getTime()
        this.battleStart = true
      }
      break

      // 远征
    case '/kcsapi/api_req_mission/result': {
      if (!this.enableRecord)
        break
      const { $useitems } = window
      const nowDate = new Date()
      const dataItem = [
        nowDate.getTime(),
        body.api_quest_name,
        ["失敗", "成功", "大成功"][body.api_clear_result] || '',
      ]

      if (body.api_clear_result === 0)
        dataItem.push(0, 0, 0, 0)
      else {
        dataItem.push(...body.api_get_material.slice(0, 4))
      }

      const useItemFlag = body.api_useitem_flag;
      [0, 1].forEach((idx) => {
        if (useItemFlag[idx] > 0) {
          const itemStr = 'api_get_item' + (idx + 1)
          const useItemId =
              (body[itemStr].api_useitem_id <= 0) ?
                useItemFlag[idx] :
                body[itemStr].api_useitem_id
          dataItem.push(
            $useitems[useItemId].api_name,
            body[itemStr].api_useitem_count
          )
        } else {
          dataItem.push('', '')
        }
      })
      dataCoManager.saveLog(CONST.typeList.mission, dataItem)
      this.store.dispatch(addLog(dataItem, CONST.typeList.mission))
      break
    }

    // 开发
    case '/kcsapi/api_req_kousyou/createitem': {
      if (!this.enableRecord) {
        break
      }
      const { $slotitems, $slotitemTypes } = window
      const timestamp = (new Date()).getTime()
      _.each(body.api_get_items, (item, index) => {
        const dataItem = [timestamp + index / 10] // apply a dcecimal to avoid key duplicating
        if (item.api_slotitem_id > -1) {
          const $item = $slotitems[item.api_slotitem_id]
          dataItem.push(
            "成功",
            $item.api_name,
            $slotitemTypes[_.get($item, 'api_type.2')].api_name
          )
        }
        else {
          dataItem.push(
            "失敗",
            'NA',
            'NA'
          )
        }
        dataItem.push(
          postBody.api_item1,
          postBody.api_item2,
          postBody.api_item3,
          postBody.api_item4
        )
        this._ships = window._ships
        const _decks = window._decks
        dataItem.push(
          `${this._ships[_decks[0].api_ship[0]].api_name}(Lv.${this._ships[_decks[0].api_ship[0]].api_lv})`,
          window._teitokuLv
        )
        dataCoManager.saveLog(CONST.typeList.createItem, dataItem)
        this.store.dispatch(addLog(dataItem, CONST.typeList.createItem))
      })
      break
    }

    // 建造
    case '/kcsapi/api_req_kousyou/createship': {
      if (!this.enableRecord)
        break
      if (body.api_result === 1) {
        this.largeFlag = (postBody.api_large_flag === "1")
        this.material = ['api_item1', 'api_item2', 'api_item3', 'api_item4', 'api_item5'].map((k) => parseInt(postBody[k]))
        this.kdockId = parseInt(postBody.api_kdock_id)
        this.createShipFlag = true
      }
      break
    }

    case '/kcsapi/api_get_member/kdock': {
      if (this.createShipFlag && this.enableRecord) {
        this._ships = window._ships
        const _decks = window._decks
        const $ships = window.$ships
        const $shiptypes = window.$shipTypes
        const apiData = body[this.kdockId - 1]
        const dataItem = [
          (new Date()).getTime(),
          this.largeFlag ? '大型建造' : '普通建造',
          $ships[apiData.api_created_ship_id].api_name,
          $shiptypes[$ships[apiData.api_created_ship_id].api_stype].api_name,
          ...this.material,
        ]
        dataItem.push(
          body.filter(kdock => kdock.api_state === 0).length,
          `${this._ships[_decks[0].api_ship[0]].api_name}(Lv.${this._ships[_decks[0].api_ship[0]].api_lv})`,
          window._teitokuLv
        )
        dataCoManager.saveLog(CONST.typeList.createShip, dataItem)
        this.store.dispatch(addLog(dataItem, CONST.typeList.createShip))
        this.createShipFlag = false
      }
      break
    }

    // 资源
    case '/kcsapi/api_port/port': {
      this.updateUser()
      this.enableRecord = true
      const nowDate = new Date()
      this.deckCombinedFlag = body.api_combined_flag
      if (this.timeString !== 'INIT' && this.timeString !== timeToBString(nowDate.getTime())) {
        this.timeString = timeToBString(nowDate.getTime())
        const dataItem = [
          (new Date()).getTime(),
          ...body.api_material.map(item => item.api_value),
        ]
        dataCoManager.saveLog('resource', dataItem)
        this.store.dispatch(addLog(dataItem, 'resource'))
      }
      break
    }
    }
  }



  handleBattleResultResponse = (e) => {
    this.battleStart = false
    const {
      map,
      quest,
      boss,
      mapCell,
      rank,
      deckHp,
      deckShipId,
      enemy,
      dropItem,
      dropShipId,
      combined,
      mvp,
    } = e.detail

    if (!this.enableRecord)
      return
    if (combined == null) {
      const event = new CustomEvent(
        'akashic.records.incompatible', {
          bubbles: true,
          cancelable: true,
          detail: {
            warning: "Your POI is out of date! You may need to visit http://0u0.moe/poi to get POI's latest release.",
          },
        }
      )
      window.dispatchEvent(event)
      this.compatible = false
    }
    if (!this.compatible)
      return

    const {
      time,
      deckInitHp,
    } = e.detail

    if (time == null || deckInitHp == null) {
      console.warn("Suggest to use up-to-date POI.")
    }

    let dataItem = [time || this.nowDate]

    const mapText = map <= 410
      ? `${quest}(${Math.floor(map / 10)}-${map % 10})`
      : `${quest}(${Math.floor(map / 10)}-${map % 10} %rank) | ${this.mapLv[map] || 0}`
    dataItem.push(
      mapText,
      `${mapCell}(${boss ? 'Boss点' : '道中'})`,
      this.isStart ? '出撃' : '進撃'
    )
    this.isStart = false
    const beforeHp = deckInitHp || deckShipId.map((id) => id !== -1 ? this._ships[id].api_nowhp : -1)
    switch (rank) {
    case 'S':
      dataItem.push(judgeIfDemage(deckHp, beforeHp) ? '勝利S' : '完全勝利!!!S')
      break
    case 'A':
      dataItem.push('勝利A')
      break
    case 'B':
      dataItem.push('戦術的勝利B')
      break
    case 'C':
      dataItem.push('戦術的敗北C')
      break
    case 'D':
      dataItem.push('敗北D')
      break
    case 'E':
      dataItem.push('敗北E')
      break
    default:
      dataItem.push(rank)
      break
    }
    dataItem.push(enemy)

    let dropData = dropShipId !== -1 ? window.$ships[dropShipId].api_name : ''
    if (dropItem && window.$useitems[dropItem.api_useitem_id] && window.$useitems[dropItem.api_useitem_id].api_name)
      dropData = `${dropData}${dropData !== '' ? ' &' : ''}${window.$useitems[dropItem.api_useitem_id].api_name}`
    dataItem.push(dropData)
    dataItem.push(judgeDanger(deckHp, deckShipId, this._ships))
    const tmp = ['', '', '', '']
    tmp[0] = `${this._ships[deckShipId[0]].api_name}(Lv.${this._ships[deckShipId[0]].api_lv})`
    tmp[2] = `${this._ships[deckShipId[mvp[0]]].api_name}(Lv.${this._ships[deckShipId[mvp[0]]].api_lv})`
    if (combined) {
      tmp[1] = `${this._ships[deckShipId[6]].api_name}(Lv.${this._ships[deckShipId[6]].api_lv})`
      tmp[3] = `${this._ships[deckShipId[6 + mvp[1]]].api_name}(Lv.${this._ships[deckShipId[6 + mvp[1]]].api_lv})`
    }
    dataItem = dataItem.concat(tmp)
    dataCoManager.saveLog(CONST.typeList.attack, dataItem)
    this.store.dispatch(addLog(dataItem, CONST.typeList.attack))
  }
}

export const apiResolver = new APIResolver(store)
export default APIResolver
