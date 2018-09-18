
dashboard.controller("HomeController", ['$rootScope', '$scope', '$state', '$location', 'backstrap_service', 'Flash',
function ($rootScope, $scope, $state, $location, backstrap_service, Flash) {
    if(backstrap_service.getSendToAccount()){
        $state.go('app.account');
    }
    var vm = this;
    
    if (backstrap_service.getSendToAccount()){    
        $state.go('app.account');       
    }
    vm.userData = backstrap_service.getUserInfo();
   
    if (vm.userData === null || vm.userData === undefined){     
        $location.path('../#/login');
        return false;
    }
    vm.showDetails = true;
    vm.home = {};   
    vm.home.mainData = [];
    var models = backstrap_service.getLocalModels();
    //var models = JSON.parse(localStorage.getItem("models"));
   
    vm.home.mainData.push({
                title: "Models",
                value: "Count: " + models.length,
                theme: "aqua",
                icon: "puzzle-piece",
                link: "modelList"
            });

    $scope.redirectTo = function(link){        
           $state.go('app.' + link);
    };

    //skills progress bar
    vm.home.skills = [
        {
            title: "Storage Limits",
            theme: "aqua",
            percentage:80
        },
        {
            title: "Request Limits",
            theme: "red",
            percentage: 83
        },
        {
            title: "CPU Cycles",
            theme: "green",
            percentage: 80
        },
        {
            title: "Daily Queries",
            theme: "yellow",
            percentage: 85
        },
        {
            title: "Time Down",
            theme: "aqua",
            percentage: 2
        },
        {
            title: "Issues / Errors",
            theme: "red",
            percentage: 3
        }
    ];

    vm.home.tools = [
       {
           Software: "Mongo DB",
           Percentage: "80",
           theme: "yellow",
           image: "mongodb"
       },
       {
           Software: "Express JS",
           Percentage: "75",
           theme: "aqua",
           image: "express",
           progressbar: "blue"
       },
       {
           Software: "Angular JS",
           Percentage: "85",
           theme: "green",
           image: "angular",
           progressbar: "blue"
       },
       {
           Software: "Node JS",
           Percentage: "83",
           theme: "lime",
           image: "node",
           progressbar: "blue"
       },
       {
           Software: "Javascript",
           Percentage: "80",
           theme: "maroon",
           image: "javascript",
           progressbar: "blue"
       },
       {
           Software: "Type Script",
           Percentage: "70",
           theme: "Gray",
           image: "typescript",
           progressbar: "blue"
       },
       {
           Software: "jQuery & AJAX",
           Percentage: "80",
           theme: "yellow",
           image: "jquery",
           progressbar: "blue"
       },
       {
           Software: "Joomla",
           Percentage: "85",
           theme: "red",
           image: "joomla",
           progressbar: "blue"
       },
        {
            Software: "HTML 5",
            Percentage: "90",
            theme: "yellow",
            image: "html5"
        },
        {
            Software: "CSS 3",
            Percentage: "83",
            theme: "aqua",
            image: "css3",
            progressbar: "blue"
        },
        {
            Software: "SAAS",
            Percentage: "72",
            theme: "green",
            image: "saas-css",
            progressbar: "blue"
        },
        {
            Software: "Bootstrap",
            Percentage: "85",
            theme: "lime",
            image: "bootstrap",
            progressbar: "blue"
        },
        {
            Software: "Photo Shop",
            Percentage: "90",
            theme: "maroon",
            image: "photoshop",
            progressbar: "blue"
        },
        {
            Software: "Corel Draw",
            Percentage: "95",
            theme: "Gray",
            image: "coreldraw",
            progressbar: "blue"
        },
        {
            Software: "Flash",
            Percentage: "65",
            theme: "yellow",
            image: "flash",
            progressbar: "blue"
        }
    ];

    //Tools I use Carousel
    $("#owl-demo").owlCarousel({


        items: 8, //10 items above 1000px browser width
        itemsDesktop: [1000, 5], //5 items between 1000px and 901px
        itemsDesktopSmall: [900, 3], // betweem 900px and 601px
        itemsTablet: [600, 2], //2 items between 600 and 0
        itemsMobile: false, // itemsMobile disabled - inherit from itemsTablet option
    });
    $("#owl-demo").trigger('owl.play', 2000);

    // Custom Navigation Events
    $(".next").click(function () {
        $("#owl-demo").trigger('owl.next');
    })
    $(".prev").click(function () {
        $("#owl-demo").trigger('owl.prev');
    })
    $(".play").click(function () {
        $("#owl-demo").trigger('owl.play', 1000); //owl.play event accept autoPlay speed as second parameter
    })
    $(".stop").click(function () {
        $("#owl-demo").trigger('owl.stop');
    })

    //cartoon photo slider carosusel
    $("#owl-single").owlCarousel({
        navigation: true, // Show next and prev buttons
        slideSpeed: 300,
        paginationSpeed: 400,
        singleItem: true,
        autoPlay: 5000, //Set AutoPlay to 3 seconds
    });
}]);

