dashboard.controller("ModelDataController", ['$rootScope', '$scope', '$state', '$location', '$q',
    'backstrap_service', 'Flash', 'ModalService',
    function ($rootScope, $scope, $state, $location, $q, backstrap_service, Flash, ModalService) {
        var vm = this;
        vm.min = 0;
        vm.max = 100;
        var rel = {
            relates_to: '',
            parameters: [{
                property: '',
                value: ''
            }]
        };
        $rootScope.fromQueryResult = false;
        backstrap_service.setSelectedEntity(null);
        $scope.dataLoading = false;
        $scope.btnExecuteText = "Execute Query";
        $scope.QueryResultItemsCount = 0;
        var itemNameNumber = 0;

        vm.query = { rels: [], props: [] };

        vm.model = backstrap_service.getSelectedModel();
        $scope.backstrapSqlQuery = "select=" + vm.model.obj_type;

        vm.allModels = backstrap_service.getLocalModels();
      
        vm.relationships = [];

        vm.model.relationships.forEach(function (rel) {
            if (rel['is_active'] === undefined || rel['is_active'] === null) {
                rel['is_active'] = true;
            }
            if (rel.is_active) {
                vm.relationships.push(rel);
            }
        });

        vm.model.properties.forEach(function (p) {
            vm.query.props.push({
                property: p.name,
                value: '',
                exact_match: false,
            });
        });


        vm.queryResults = [];
        if ($rootScope.backToQueryResults) {
            vm.queryResults = $rootScope.queryResults;
            $scope.QueryResultItemsCount = vm.queryResults.length;

            $scope.dataLoading = true;
            $scope.btnExecuteText = "Loading Data...";
            var deferred = $q.defer();
            var query = createQueryJSON();
            itemNameNumber = $scope.QueryResultItemsCount;

            $scope.selectedIndex = 0;
            $scope.dataLoading = false;
            $scope.btnExecuteText = "Execute Query";

        }

        $rootScope.backToQueryResults = false;

        $scope.checkRel = function (rel) {
            var toRemove = -1;
            var removeRel = false;
            vm.query.rels.forEach(function (r) {
                toRemove++;
                if (r.relates_to === rel.relates_to) {
                    removeRel = true;
                }
            });
            if (removeRel) {
                vm.query.rels.splice(toRemove, 1);
            }
            else {
                var relToAdd = {
                    relates_to: rel.relates_to,
                    lookup_rel_type: '',
                    parameters: []
                };
                vm.allModels.forEach(function (m) {
                    if (m.obj_type === rel.relates_to) {
                        m.properties.forEach(function (p) {
                            relToAdd.parameters.push({
                                property: p.name,
                                value: '',
                                exact_match: true,
                            });
                        });
                    }
                });
                vm.query.rels.push(relToAdd);
            }
        };

        $scope.showJSON = function () {
            var title = createQueryJSON();
            ModalService.showModal({
                templateUrl: '../../app/modules/dashboard/views/query_json.html',
                controller: "QueryJSONController",
                inputs: {
                    title: title,
                }
            }).then(function (modal) {
                modal.element.modal();
                modal.close.then(function (result) {

                });
            });
        };

        function createQueryJSON() {
            var query = '';
            query += "{" +
                "\"query_object\": {" +
                "\"resolve\": [\"*\"]," +
                "\"obj_type\": \"" + vm.model.obj_type + "\"," +
                "\"parameters\": [";
            var ix = 0;
            vm.query.props.forEach(function (p) {
                if (p.value.length > 0) {
                    query += (ix == 0 ? "[" : ",[") +
                        "\"" + p.property + "\"," +
                        "\"" + p.value + "\"," +
                        "\"" + (p.exact_match ? 'exact' : 'partial') + "\"" +
                        "]";
                    ix++;
                }
            });
            query += "]," +
                "\"relates_to\": [";
            ix = 0;
            vm.query.rels.forEach(function (r) {
                query += (ix == 0 ? "{" : ",{") +
                    "\"obj_type\": \"" + r.relates_to + "\"," +
                    "\"rel_type\": \"" + r.lookup_rel_type + "\"," +
                    "\"parameters\": [";
                var ixx = 0;
                r.parameters.forEach(function (p) {
                    if (p.value.length > 0) {
                        query += (ixx == 0 ? "[" : ",[") +
                            "\"" + p.property + "\"," +
                            "\"" + p.value + "\"," +
                            "\"" + (p.exact_match ? 'exact' : 'partial') + "\"" +
                            "]";
                        ixx++;
                    }
                });
                query += "]}";
                ix++;
            });
            query += "]," +
                "\"offset\": " + vm.min + "," +
                "\"range\": " + vm.max +
                "}}";
            console.log(query);
            return JSON.stringify(JSON.parse(query), null, "    ");
        }





        $scope.removeTab = function (item) {
            var ix = 0;
            var toRemove = 0;
            vm.queryResults.forEach(function (qr) {
                if (qr.title === item.title) {
                    toRemove = ix;
                }
                ix++;
            });


            vm.queryResults.splice(toRemove, 1);
            $scope.QueryResultItemsCount = vm.queryResults.length;


            //was it somewhere in the middle or at the end
            var ixToSet = $scope.QueryResultItemsCount;
            if (ixToSet <= 0){
                ixToSet = 0;
            }
            $scope.selectedIndex = ixToSet;

        }


        function makeTabular(json) {
            var table = {
                headers: [],
                rows: []
            };
            var ixx = 0;
            var css_string = 'text-center ';
            vm.model.properties.forEach(function (p) {
                ixx++;
                css_string = 'text-center ';
                if (ixx < 3) {
                    css_string += 'media-priority-1';
                }
                else if (ixx < 5) {
                    css_string += 'media-priority-2';
                }
                else if (ixx > 5) {
                    css_string += 'media-priority-3';
                }
                if (p.name !== 'id') {
                    table.headers.push({ 'propTitle': p.name, 'css': css_string });
                }
            });

            json.forEach(function (obj) {
                var row = [];
                row["row_items"] = [];
                ixx = 0;
                vm.model.properties.forEach(function (p) {
                    ixx++;
                    var propVal = obj[p.name];
                    /**
                    var isO2 = false;
                      if (propVal === undefined){
                          propVal = obj[0][p.name];  
                           if (propVal === undefined){
                              propVal = '';
                           }
                           else{
                               isO2 = true;
                           }
                      }
                      */
                    css_string = 'text-center ';
                    if (ixx < 3) {
                        css_string += 'media-priority-1';
                    }
                    else if (ixx < 5) {
                        css_string += 'media-priority-2';
                    }
                    else if (ixx > 5) {
                        css_string += 'media-priority-3';
                    }
                    var objProp = { item: propVal, css: css_string };
                    if (p.name !== 'id') {
                        row["row_items"].push(objProp);
                    }
                    //row["obj"] = isO2 ? obj[0] : obj;
                    row["obj"] = obj;
                });

                table.rows.push(row)
            });

            return table;
        }

        function showPagination() {
            return true;
        };

        $scope.toggleExact = function (p) {
            p.exact_match = !p.exact_match;
        }

        $scope.executeBackstrapSqlQuery = function () {
            if (!$scope.dataLoading) {
                if ($scope.QueryResultItemsCount > 2) {
                    vm.queryResults.splice($scope.QueryResultItemsCount, 1);
                }
                var ix = $scope.backstrapSqlQuery.indexOf("&resolve");
                if (ix != -1){
                    $scope.backstrapSqlQuery = $scope.backstrapSqlQuery.substring(0, ix);                     
                }
                $scope.dataLoading = true;
                $scope.btnExecuteText = "Loading Data...";               
                backstrap_service.executeBackstrapSqlQuery($scope.backstrapSqlQuery + "&resolve=*")
                    .then(function (queryItems) {console.log(queryItems);
                        loadQueryResults(queryItems, query);
                    });
            }
        }

        $scope.postQuery = function () {
            //prevent double clicking
            if (!$scope.dataLoading) {
                if ($scope.QueryResultItemsCount > 2) {
                    vm.queryResults.splice($scope.QueryResultItemsCount, 1);
                }
                $scope.dataLoading = true;
                $scope.btnExecuteText = "Loading Data...";               
                var query = createQueryJSON();
                backstrap_service.postBackstrapQuery(query)
                    .then(function (queryItems) {
                        loadQueryResults(queryItems, query);
                    });
            }
        };

        function loadQueryResults(queryItems, query) {
            console.log(queryItems);
            $scope.QueryResultItemsCount++;
            itemNameNumber++;
            var titleOrig = vm.model.obj_type + ' ' + itemNameNumber;
            var qr = {
                titleOrig: titleOrig,
                title: titleOrig,
                editingTitle: false,
                query: query,
                items: [],
                table: {},
                id: '',
                skip: 0,
                take: 15,
                paginatedList: [],
                pageOfText: '',
                set: function () {
                    this.paginatedList = this.table.rows.length > this.take ?
                        this.table.rows.slice(this.skip, (this.skip + this.take))
                        : this.table.rows;
                    this.refreshText();
                },
                previous: function () {
                    this.skip = this.skip - this.take;
                    this.paginatedList = this.table.rows.slice(this.skip, (this.skip + this.take));
                    this.refreshText();
                },
                next: function () {
                    this.skip = this.skip + this.take;
                    this.paginatedList = this.table.rows.slice(this.skip, (this.skip + this.take));
                    this.refreshText();
                },
                refreshText: function () {
                    this.showNext = (this.skip + this.take) < this.table.rows.length;
                    this.showPrevious = this.skip > 0;
                    if (this.table.rows.length > this.take) {
                        var ofLen = this.table.rows.length < (this.skip + this.take) ? this.table.rows.length : (this.skip + this.take);
                        this.pageOfText = 'Showing ' + (this.skip + 1) + ' - ' + ofLen + ' of ' + this.table.rows.length;
                    }
                    else {
                        this.pageOfText = 'Showing ' + this.table.rows.length;
                    }
                },
                showNext: false,
                showPrevious: false,
                setRow: function (row) {
                    var entity = row['obj'];
                    backstrap_service.setSelectedEntity(entity);
                    $rootScope.fromQueryResult = true;
                    $state.go('app.entityUpdate');
                },
                validateTitle: function () {

                    if (this.title.length === 0) {
                        this.title = this.titleOrig;
                    }
                }
            };
            qr.items.push(JSON.stringify(queryItems.results));
            qr.table = makeTabular(queryItems.results);
            qr.set();
            vm.queryResults.push(qr);
            $scope.selectedIndex = $scope.QueryResultItemsCount;
            $scope.dataLoading = false;
            $scope.btnExecuteText = "Execute Query";
            $rootScope.queryResults = vm.queryResults;
        }

    }]);