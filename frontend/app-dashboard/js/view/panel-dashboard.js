define([
    'backbone',
    'underscore',
    'jquery',
    'jqueryUi',
    'chartjs',
    'chartPluginLabel',
    'filesaver',
    'js/model/trigger_status.js',
], function (Backbone, _, $, JqueryUi, Chart, ChartJsPlugin, fileSaver, TriggerStatusCollection) {
    return Backbone.View.extend({
        template: _.template($('#dashboard-template').html()),
        loading_template: '<i class="fa fa-spinner fa-spin fa-fw"></i>',
        status_wrapper: '#action-status',
        general_summary: '#flood-general-summary',
        sub_summary: '#flood-sub-summary',
        el: '#panel-dashboard',
        referer_region: [],
        sub_region_title_template: _.template($('#region-title-panel-template').html()),
        sub_region_item_template: _.template($('#region-summary-panel-template').html()),
        status_text: {
            [TriggerStatusCollection.constants.ACTIVATION]: 'REACHED - Activate your EAP',
            [TriggerStatusCollection.constants.PRE_ACTIVATION]: 'Stand by',
            [TriggerStatusCollection.constants.NOT_ACTIVATED]: 'No Activation'
        },
        events: {
            'click .drilldown': 'drilldown',
            'click .btn-back-summary-panel': 'backPanelDrilldown',
            'click .download-spreadsheet': 'fetchExcel',
            'click .tab-title': 'switchTab'
        },
        initialize: function () {
            this.referer_region = [];
            dispatcher.on('dashboard:render-chart-building', this.renderChartBuilding, this);
            dispatcher.on('dashboard:render-chart-element', this.renderChartElement, this);
            dispatcher.on('dashboard:reset', this.resetDashboard, this);
            dispatcher.on('dashboard:hide', this.hideDashboard, this);
            dispatcher.on('dashboard:render-region-summary', this.renderRegionSummary, this);
            dispatcher.on('dashboard:inject-road-region-summary', this.injectRoadRegionSummary, this);
            dispatcher.on('dashboard:change-trigger-status', this.changeStatus, this);

            this.$el = $(this.el);
        },
        render: function () {
            this.referer_region = [];
            let that = this;
            let $action = $(that.status_wrapper);
            $action.html(that.loading_template);

            let general_template = that.template;

            let flood_acquisition_date = new Date(floodCollectionView.selected_forecast.attributes.acquisition_date);
            let flood_forecast_date = new Date(floodCollectionView.selected_forecast.attributes.forecast_date);

            let lead_time = floodCollectionView.selected_forecast.attributes.lead_time;
            let event_status = 'Current';
            if(floodCollectionView.selected_forecast.attributes.is_historical){
                event_status = 'Historical'
            }
            $(that.general_summary).html(general_template({
                flood_name: floodCollectionView.selected_forecast.attributes.notes,
                acquisition_date: flood_acquisition_date.getDate() + ' ' + monthNames[flood_acquisition_date.getMonth()] + ' ' + flood_acquisition_date.getFullYear(),
                forecast_date: flood_forecast_date.getDate() + ' ' + monthNames[flood_forecast_date.getMonth()] + ' ' + flood_forecast_date.getFullYear(),
                source: floodCollectionView.selected_forecast.attributes.source,
                notes: floodCollectionView.selected_forecast.attributes.notes,
                link: floodCollectionView.selected_forecast.attributes.link,
                lead_time: lead_time + ' Day(s)',
                event_status: event_status
            }));
            $('#vulnerability-score').html(that.loading_template);
            $('#building-count').html(that.loading_template);
            $('#vulnerability-score-road').html(that.loading_template);
            $('#road-count').html(that.loading_template);
            this.changeStatus(floodCollectionView.selected_forecast.attributes.trigger_status);
        },
        renderChartElement: function (data, element) {
            let $parentWrapper = $('#chart-score-panel');
            $parentWrapper.find('#summary-chart-' + element).remove();
            $parentWrapper.find('.panel-chart-' + element).html('<canvas id="summary-chart-'+ element +'"></canvas>');
            $parentWrapper.find('#summary-chart-' + element + '-residential').remove();
            $parentWrapper.find('.panel-chart-' + element + '-residential').html('<canvas id="summary-chart-'+ element +'-residential" style="height: 50px"></canvas>');

            let total_road_array = [];
            let graph_data = [];
            let flood_graph_data = [];
            let backgroundColours = [];
            let unlisted_key = [
                'id', 'flood_event_id', 'total_vulnerability_score', 'flooded_building_count', 'building_count',
                'village_id', 'name', 'region', 'district_id', 'sub_district_id', 'sub_dc_code', 'village_code', 'dc_code',
                'trigger_status', 'road_count'
            ];
            let residential_flood_data = [];
            let residential_data = [];
            for(var key in data) {
                if(unlisted_key.indexOf(key) === -1 && key.indexOf('flood') > -1) {
                    if(key.indexOf('residential') > -1){
                        residential_flood_data = data[key]
                    }else {
                        flood_graph_data.push({
                            y: key.replace('_flooded_road_count', ''),
                            x: data[key]
                        });
                    }
                }

                if(unlisted_key.indexOf(key) === -1 && key.indexOf('flood') === -1) {
                    let flood_key = key.replace('_road_count', '_flooded_road_count');
                    let count = data[key] - data[flood_key];
                    if(!count === NaN){
                        count = 0
                    }

                    if(key.indexOf('residential') > -1){
                        residential_data = count
                    }else {
                        graph_data.push({
                            y: key.replace('_road_count', ''),
                            x: count
                        });
                    }

                    total_road_array.push({
                        key: key.replace('_road_count', ''),
                        value: data[key]
                    })
                }
                backgroundColours.push('#82B7CA');
            }

            total_road_array.sort(function(a, b){return b.value - a.value});

            var label = [];
            for(var o in total_road_array) {
                if(total_road_array[o].key.indexOf('residential') === -1) {
                    label.push(total_road_array[o].key);
                }
            }

            graph_data.sort(function(a, b){
              return label.indexOf(a.y) - label.indexOf(b.y);
            });

            flood_graph_data.sort(function(a, b){
              return label.indexOf(a.y) - label.indexOf(b.y);
            });

            let humanLabel = [];
            for(let i=0; i<label.length; i++) {
                humanLabel.push(toTitleCase(label[i].replace('_', ' ')))
            }

            var ctxResidential = document.getElementById('summary-chart-road-residential').getContext('2d');
            var datasetsResidential = {
                labels: ["Not Flooded", "Flooded"],
                datasets: [
                    {
                        data: [residential_data, residential_flood_data],
                        backgroundColor: ['#e5e5e5', '#82B7CA']
                    }
                ],
            };

            var ctx = document.getElementById('summary-chart-road').getContext('2d');
            var datasets = {
                labels: humanLabel,
                datasets: [
                    {
                        label: "Not Flooded",
                        data: graph_data
                    }, {
                        label: "Flooded",
                        data: flood_graph_data,
                        backgroundColor: backgroundColours
                    }]
            };

            let total_vulnerability_score = data['total_vulnerability_score'] ? data['total_vulnerability_score'].toFixed(2): 0;
            $('#vulnerability-score-' + element).html(total_vulnerability_score);
            $('#'+ element +'-count').html(data['flooded_road_count']);
            this.renderChartData(datasets, ctx, 'Residential ' + toTitleCase(element) + 's', datasetsResidential, ctxResidential, 'Other ' + toTitleCase(element) + 's');
        },
        renderChartBuilding: function (data, main_panel) {
            let that = this;
            let id_key = {
                'district': 'district_id',
                'sub_district': 'sub_district_id',
                'village': 'village_id'
            };
            let trigger_status = $("#status").attr('data-region-trigger-status');
            if(main_panel){
                $('.btn-back-summary-panel').hide();
                let referer = {
                    region: 'district',
                    id: 'main',
                    trigger_status: trigger_status
                };
                if(!that.containsReferer(referer, that.referer_region)) {
                    that.referer_region.push(referer);
                }
                $('#main-panel-header').html('Summary for Flood ' + floodCollectionView.selected_forecast.attributes.notes)
            }else {
                $('.btn-back-summary-panel').show();
                let region = data['region'];
                let referer = {
                    region: region,
                    id: data[id_key[region]],
                    trigger_status: trigger_status
                };
                if(!that.containsReferer(referer, that.referer_region)) {
                    that.referer_region.push(referer);
                }
                $('#main-panel-header').html('Summary For ' + toTitleCase(region.replace('_', ' ')) + ' ' + data["name"])
            }

            let $parentWrapper = $('#chart-score-panel');
            $parentWrapper.find('#summary-chart').remove();
            $parentWrapper.find('.panel-chart').html('<canvas id="summary-chart" style="height: 250px"></canvas>');
            $parentWrapper.find('#summary-chart-residential').remove();
            $parentWrapper.find('.panel-chart-residential').html('<canvas id="summary-chart-residential" style="height: 100px"></canvas>');
            $('#region-summary-panel').html('');

            let total_building_array = [];
            let graph_data = [];
            let flood_graph_data = [];
            let backgroundColours = [];
            let unlisted_key = [
                'id', 'flood_event_id', 'total_vulnerability_score', 'flooded_building_count', 'building_count',
                'village_id', 'name', 'region', 'district_id', 'sub_district_id', 'sub_dc_code', 'village_code', 'dc_code',
                'trigger_status'
            ];
            let residential_flood_data = [];
            let residential_data = [];
            for(var key in data) {
                if(unlisted_key.indexOf(key) === -1 && key.indexOf('flood') > -1) {
                    if(key.indexOf('residential') > -1){
                        residential_flood_data = data[key]
                    }else {
                        flood_graph_data.push({
                            y: key.replace('_flooded_building_count', ''),
                            x: data[key]
                        });
                    }
                }

                if(unlisted_key.indexOf(key) === -1 && key.indexOf('flood') === -1) {
                    let flood_key = key.replace('_building_count', '_flooded_building_count');
                    let count = data[key] - data[flood_key];
                    if(!count === NaN){
                        count = 0
                    }

                    if(key.indexOf('residential') > -1){
                        residential_data = count
                    }else {
                        graph_data.push({
                            y: key.replace('_building_count', ''),
                            x: count
                        });
                    }

                    total_building_array.push({
                        key: key.replace('_building_count', ''),
                        value: data[key]
                    })
                }
                backgroundColours.push('#82B7CA');
            }

            total_building_array.sort(function(a, b){return b.value - a.value});

            var label = [];
            for(var o in total_building_array) {
                if(total_building_array[o].key.indexOf('residential') === -1) {
                    label.push(total_building_array[o].key);
                }
            }

            graph_data.sort(function(a, b){
              return label.indexOf(a.y) - label.indexOf(b.y);
            });

            flood_graph_data.sort(function(a, b){
              return label.indexOf(a.y) - label.indexOf(b.y);
            });

            let humanLabel = [];
            for(let i=0; i<label.length; i++) {
                humanLabel.push(toTitleCase(label[i].replace('_', ' ')))
            }

            var ctxResidential = document.getElementById('summary-chart-residential').getContext('2d');
            var datasetsResidential = {
                labels: ["Not Flooded", "Flooded"],
                datasets: [{
                    data: [residential_data, residential_flood_data],
                    backgroundColor: ['#e5e5e5', '#82B7CA']
                }]
            };
            var ctx = document.getElementById('summary-chart').getContext('2d');
            var datasets = {
                labels: humanLabel,
                datasets: [
                    {
                        label: "Not Flooded",
                        data: graph_data
                    }, {
                        label: "Flooded",
                        data: flood_graph_data,
                        backgroundColor: backgroundColours
                    }]
            };

            let total_vulnerability_score = data['total_vulnerability_score'] ? data['total_vulnerability_score'].toFixed(2): 0;
            $('#vulnerability-score').html(total_vulnerability_score);
            $('#building-count').html(data['flooded_building_count']);

            this.renderChartData(datasets, ctx, 'Residential Buildings', datasetsResidential, ctxResidential, 'Other Buildings');
        },
        renderChartData: function (datasets, ctx, title, datasetsResidential, ctxResidential, title2) {
            new Chart(ctxResidential, {
                type: 'pie',
                data: datasetsResidential,
                options: {
                    legend: {
                        display: true
                    },
                    title: {
                        display: true,
                        text: title
                    },
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        labels: {
                            render: 'value',
                            position: 'outside',
                            textMargin: 4
                        }
                    }
                }
            });

            new Chart(ctx, {
                type: 'horizontalBar',
                data: datasets,
                options: {
                    legend: {
                        display: true
                    },
                    scales: {
                        xAxes: [{
                            stacked: true,
                            gridLines: {
                                display:false
                            },
                            ticks: {
                                min: 0
                            }
                        }],
                        yAxes: [{
                            stacked: true,
                            gridLines: {
                                display:false
                            },
                        }]
                    },
                    title: {
                        display: true,
                        text: title2
                    },
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        },
        renderRegionSummary: function (data, region, id_field) {
            let that = this;
            let $wrapper = $('#region-summary-panel');
            let title = this.sub_region_title_template;
            $wrapper.html(title({
                region: toTitleCase(region.replace('_', ''))
            }));
            let item_template = this.sub_region_item_template;
            let $table = $('<table></table>');
            for(let u=0; u<data.length; u++){
                let item = data[u];
                let trigger_status = data[u].trigger_status || 0;
                let building_total_score = item['flooded_building_count'] ? item['flooded_building_count'] : '-';
                $table.append(item_template({
                    region: region,
                    id: item[id_field],
                    name: item['name'],
                    flooded_road_count: that.loading_template,
                    flooded_building_count: building_total_score,
                    flooded_population_count: '-',
                    trigger_status: trigger_status
                }));
            }
            $wrapper.append($table);
        },
        injectRoadRegionSummary: function (data, region, id_field) {
            let $wrapper = $('#region-summary-panel');
            for(let u=0; u<data.length; u++){
                let item = data[u];
                let road_total_score = item['flooded_road_count'] ? item['flooded_road_count'] : '-';
                let div = $wrapper.find('[data-road-region-id=' + item[id_field] + ']');
                $(div).find('.score').html(road_total_score);
            }
        },
        changeStatus: function (status) {
            status = status || 0;
            $(this.status_wrapper).html(this.status_text[status].toUpperCase() + '!');
            $('#status').removeClass().addClass(`trigger-status-${status}`).attr('data-region-trigger-status', status);
        },
        resetDashboard: function () {
            this.referer_region = [];
            $(this.status_wrapper).html('-');
            $(this.general_summary).empty().html('' +
                '<div class="panel-title">' +
                '        No data available.' +
                '    </div>');
            $('#status').removeClass().addClass('trigger-status-none');
        },
        hideDashboard: function () {
            this.referer_region = [];
            let $datepicker = $('.datepicker-browse');
            let datepicker_data = $datepicker.data('datepicker');
            datepicker_data.clear();
            $('#panel-dashboard').hide();
        },
        drilldown: function (e) {
            let that = this;
            let $button = $(e.target).closest('.drilldown');
            let region = $button.attr('data-region');
            let region_id = parseInt($button.attr('data-region-id'));
            let trigger_status = $button.attr('data-region-trigger-status');
            $('.btn-back-summary-panel')
                .attr('data-region', that.referer_region[that.referer_region.length - 1].region)
                .attr('data-region-id', that.referer_region[that.referer_region.length -1].id)
                .attr('data-region-trigger-status', that.referer_region[that.referer_region.length -1].trigger_status);
            this.changeStatus(trigger_status);
            dispatcher.trigger('flood:fetch-stats-data', region, region_id, false);
            dispatcher.trigger('flood:fetch-stats-data-road', region, region_id, false);
            this.fetchExtent(region_id, region);
            let forecast_id = floodCollectionView.selected_forecast.id;
            dispatcher.trigger('map:show-exposed-roads', forecast_id, region, region_id);
            dispatcher.trigger('map:show-region-boundary', region, region_id);
            dispatcher.trigger('map:show-exposed-buildings', forecast_id, region, region_id);
            $('#accordion').animate({
              scrollTop: 0
            }, 0)
        },
        backPanelDrilldown: function (e) {
            let that = this;
            this.referer_region.pop();

            let $button = $(e.target).closest('.btn-back-summary-panel');
            let region = $button.attr('data-region');
            let region_id = $button.attr('data-region-id');
            let trigger_status = $button.attr('data-region-trigger-status');
            let main = false;
            if(region_id === 'main'){
                main = true
            }

            let referer_region = '';
            let referer_region_id = '';
            let referer_trigger_status = 0;
            try {
                this.referer_region.pop();
                referer_region = that.referer_region[that.referer_region.length - 1].region;
                referer_region_id = that.referer_region[that.referer_region.length - 1].id;
                referer_trigger_status = that.referer_region[that.referer_region.length - 1].trigger_status;
            }catch (err){

            }

            $('.btn-back-summary-panel')
                .attr('data-region', referer_region)
                .attr('data-region-id', referer_region_id)
                .attr('data-region-trigger-status', referer_trigger_status);
            this.changeStatus(trigger_status);
            dispatcher.trigger('flood:fetch-stats-data', region, region_id, main);
            dispatcher.trigger('flood:fetch-stats-data-road', region, region_id, main);
            this.fetchExtent(region_id, region);
            let forecast_id = floodCollectionView.selected_forecast.id;
            dispatcher.trigger('map:show-exposed-roads', forecast_id, region, region_id);
            dispatcher.trigger('map:show-region-boundary', region, region_id);
            dispatcher.trigger('map:show-exposed-buildings', forecast_id, region, region_id);
        },
        containsReferer: function (obj, list) {
            var i;
            for (i = 0; i < list.length; i++) {
                if (list[i].region === obj.region && list[i].id === obj.id) {
                    return true;
                }

                if (list[i].region === obj.region && list[i].id !== 'main') {
                    return true;
                }
            }

            return false;
        },
        downloadSpreadsheet: function (data) {
            const b64toBlob = (b64Data, contentType='', sliceSize=512) => {
                const byteCharacters = atob(b64Data);
                const byteArrays = [];

                for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
                const slice = byteCharacters.slice(offset, offset + sliceSize);

                const byteNumbers = new Array(slice.length);
                for (let i = 0; i < slice.length; i++) {
                  byteNumbers[i] = slice.charCodeAt(i);
                }

                const byteArray = new Uint8Array(byteNumbers);
                byteArrays.push(byteArray);
                }

                const blob = new Blob(byteArrays, {type: contentType});
                return blob;
            };

            let type = 'application/vnd.ms-excel';
            const blob = b64toBlob(data, type);
            saveAs(blob, floodCollectionView.selected_forecast.attributes.notes + ".xlsx");

        },
        fetchExcel: function (){
            let that = this;
            const modal = $('#fbf-modal');
            let $loadingIcon = $('.download-spreadsheet-loading');
            $loadingIcon.show();
            $loadingIcon.closest('button').prop('disabled', true);
            $.post({
                url: `${postgresUrl}rpc/flood_event_spreadsheet`,
                data: {
                    "hazard_event_id":floodCollectionView.selected_forecast.attributes.id
                },
                success: function (data) {
                    $loadingIcon.hide();
                    $loadingIcon.closest('button').prop('disabled', false);
                    if (data.length > 0 && data[0].hasOwnProperty('spreadsheet_content') && data[0]['spreadsheet_content']) {
                        that.downloadSpreadsheet(data[0]['spreadsheet_content']);
                    } else {
                        modal.find('.modal-body-content').html('Summary data could not be found.');
                        modal.modal(
                            'toggle'
                        );
                    }
                },
                error: function () {
                    $loadingIcon.hide();
                    $loadingIcon.closest('button').prop('disabled', false);
                }
            })
        },
        fetchExtent: function (region_id, region) {
            if(!region_id || !region){
                return []
            }

            if(region_id === 'main'){
                dispatcher.trigger('map:fit-forecast-layer-bounds', floodCollectionView.selected_forecast)
            }

            $.get({
                url: postgresUrl + `vw_${region}_extent?id_code=eq.${region_id}`,
                success: function (data) {
                    if(data.length > 0) {
                        let coordinates = [[data[0].y_min, data[0].x_min], [data[0].y_max, data[0].x_max]];
                        dispatcher.trigger('map:fit-bounds', coordinates)
                    }
            }});
        },
        switchTab: function (e) {
            let $div = $(e.target).closest('.tab-title');
            if(!$div.hasClass('tab-active')) {
                $('.tab-wrapper').hide();
                $('.tab-title').removeClass('tab-active').removeClass('col-lg-6');
                $('.tab-title').each(function () {
                    let that = this;
                    if(!$(that).hasClass('col-lg-3')){
                        $(that).addClass('col-lg-3')
                    }
                });
                $div.addClass('tab-active').removeClass('col-lg-3').addClass('col-lg-6');
                $('.tab-name').hide();
                $div.find('.tab-name').show();
                let target = $div.attr('tab-target');
                $('.tab-' + target).show();
            }
        }
    })
});
