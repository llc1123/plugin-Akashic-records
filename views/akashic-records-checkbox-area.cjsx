{React, ReactBootstrap, jQuery, config} = window
{Panel, Button, Col, Input, Grid, Row} = ReactBootstrap

AkashicRecordsCheckboxArea = React.createClass
  getInitialState: ->
    rowChooseChecked: [true, true, true, true, true, true, true, true, true, true, true, true,
                      true, true]
  componentWillMount: ->
    @setState
      rowChooseChecked: @props.rowChooseChecked
  handleClickCheckbox: (index) ->
    {rowChooseChecked} = @state
    rowChooseChecked[index] = !rowChooseChecked[index]
    @setState {rowChooseChecked}
    @props.filterRules(rowChooseChecked)
    config.set "plugin.Akashic.#{@props.contentType}.checkbox", JSON.stringify rowChooseChecked
  render: ->
    <div id='akashic-records-settings'>
      <Grid id='akashic-records-filter'>
        <Row>
        {
          for checkedVal, index in @props.tableTab
            continue if !index
            <Col key={index} xs={2}>
              <Input type='checkbox' value={index} onChange={@handleClickCheckbox.bind(@, index)} checked={@state.rowChooseChecked[index]} style={verticalAlign: 'middle'} label={checkedVal} />
            </Col>
        }
        </Row>
      </Grid>
    </div>

module.exports = AkashicRecordsCheckboxArea
