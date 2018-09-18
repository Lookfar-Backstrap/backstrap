
app.service('pagination_service', [
function () {
    var bsPagination = this;
    var skip = 0;
    var take = 15;   
    var list = [];
    var description = '';

    bsPagination.init = function(desc){
        description = desc;
    };

    bsPagination.set = function(l){       
        list = l;
        skip = 0;      
    };
   
    bsPagination.getList = function(){
        return list.slice(skip, (skip + take));
    };

    bsPagination.showNext = function(){
        return (skip + take) < list.length;
    };

    bsPagination.showPrevious = function(){
        return skip > 0;
    };

    bsPagination.pageOfText = function(){
        if (list.length > take){
            var ofLen = list.length < (skip + take) ? list.length : (skip + take);
            return 'Showing ' + (skip + 1) + ' - ' + ofLen + ' of ' + list.length + ' ' + description;
        }
        else{
            return 'Showing ' + list.length + ' ' + description;
        }
    };

    bsPagination.increment = function(){
        skip = skip + take;        
    };

    bsPagination.decrement = function(){
        skip = skip - take;
    };

    bsPagination.showPagination = function(){
       return true;
    };

}]);