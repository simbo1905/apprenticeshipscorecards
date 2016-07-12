/// <autosync enabled="true" />
/// <reference path="modernizr-2.6.2.js" />
/// <reference path="jquery-1.10.2.js" />
/// <reference path="jquery.validate.js" />
/// <reference path="jquery.validate.unobtrusive.js" />
/// <reference path="bootstrap.js" />
/// <reference path="respond.js" />
/// <reference path="d3.js" />

var state;

// -----------------------------------
// Initialisation
// -----------------------------------
(function initialisePage() {
    state = {
        providerpage: 1,
        lastprn: null,
        showmenu: true
    };

    renderMoreProviders();

    var requestedPrn = currentRequestedProvider();
    if (!!requestedPrn) {
        setMode("view-details");
        getProviderDetails(requestedPrn);        
    } else {
        setMode("main");
    };
})();


// ---------------------------------
// Event listeners
// ---------------------------------
window.onhashchange = function navigate() {
    var requestedPrn = currentRequestedProvider();
    if (!!requestedPrn) {
        getProviderDetails(requestedPrn);
    } else {
        setMode("main");

        //cause the provider to flash within the list
        var $providerbox = $("div[data-ukprn='" + state.lastprn + "']");
        if ($providerbox.length) {
            $(window).scrollTop($providerbox.offset().top - 150);
            $providerbox.addClass("bump");
            setTimeout(function () { $providerbox.removeClass("bump") }, 3000);
        }
    }
};

var oldWidth = $(window).width();
window.addEventListener("resize", debounce(function () {
    if (oldWidth === $(window).width()) {
        // don't trigger on height-only resizes
        return;
    }
    oldWidth = $(window).width();
    var graphContainers = $(".graph-container");
    graphContainers.html("");
    graphContainers.addClass("empty");
    renderNewGraphs();
}, 500))

//when scrolling to the bottom of the list, load more Providers
$(window).scroll(function () {
    checkScrollState();
});

$(document).on("click", ".get-providerdetails", function (e) {
    currentRequestedProvider($(this).data("ukprn"));
});

$(document).on("mouseover", ".bar", function (e) {
    $(".datatooltip").remove();
    var $this = $(this);
    // The timeout allows all mouse events to occur before the tooltip appears.
    // This way, we can distinguish between touch events (which cause a mouseover + click)
    // and mouse clicks, which just cause a click.
    // cf. the "click" listener on .bar, below.
    setTimeout(function () { renderTooltip($this); },1);

}).on("mouseout", ".bar", function (e) {
    $(".datatooltip").remove();
});

$(document).on("click", ".bar", function (e) {
    if (!$(".datatooltip").is(":visible")) {
        //the tooltip hasn't rendered yet, so this is a touch event
        e.preventDefault();
        e.stopPropagation();
        return true;
    }
})

$(document).on("click", ".prevent-propagation", function (event) {
    event.stopPropagation();
    return true;
});

// filter menu
$("#menu-button").click(updateFilterVisibility)

var formChangeCallback = debounce(findProvider, 300);
$('#find-provider input').keypress(formChangeCallback)
$('#find-provider-subject').change(formChangeCallback)
$('#find-provider-distance').change(function () {
    if ($("#find-provider-postcode").val() !== "") {
        formChangeCallback();
    }
})

$("#sortby").change(formChangeCallback);

$("#clear-search").click(function (e) {
    $("#find-provider-provider").val("");
    $("#find-provider-subject").val("0");
    $("#find-provider-postcode").val("");
    $("#find-provider-distance").val("5");
    $("#sortby").val("name");
    findProvider();
})


$("#close-search").click(function () {
    updateFilterVisibility(false)
});

$("#find-provider-submit").click(function (e) {
    updateFilterVisibility(false);
    e.preventDefault();
});

function findProvider(e) {
    renderMoreProviders(true);
}

function updateFilterVisibility(pNewVal) {
    var newVal = pNewVal === true || pNewVal === false
        ? pNewVal
        : !state.showmenu;

    state.showmenu = newVal;
    if (state.showmenu) {
        $("#menu-button").addClass("active");
        $("#find-provider").addClass("active");
    } else {
        $("#menu-button").removeClass("active");
        $("#find-provider").removeClass("active");
    }
}

// subject sorter
$(document).on("change", "#subject-sortby", function () {
    sortSubjectsBy($(this).val());
});

function sortSubjectsBy(sortBy) {
    var sorterSelectors = {
        "name": function ($div) { return $("h1", $div).text(); },
        "earnings": function ($div) { return $(".graph-container", $div).prop("__data__")[0].value; },
        "satisfaction": function ($div) { return $(".graph-container", $div).prop("__data__")[1].value; },
        "passrate": function ($div) { return $(".graph-container", $div).prop("__data__")[2].value; },
    };
    var sel = sorterSelectors[sortBy];
    var $subjects = $("#subjects-all .singleSubject");
    $subjects.sort(function (a, b) {
        var aval = sel($(a)), bval = sel($(b));
        if (bval === null || bval === undefined) return (aval === null || aval === undefined) ? 0 : -1;
        if (aval === null || aval === undefined) return 1;
        
        if ($.type(aval) === "string") {
            return aval.localeCompare(bval);
        } else {
            return aval > bval ? -1
                 : aval < bval ? 1
                 : 0;
        }
    })
    $subjects.detach().appendTo($("#subjects-all"));
};

// -----------------------------------
// DOM Manipulation
// -----------------------------------
function setMode(mode) {
    $('.body-content').attr("mode", mode);
    setTimeout(renderNewGraphs);
}

function renderMoreProviders(reset) {
    if (reset) {
        $("#noResults").hide();
        state.providerpage = 1;
    }

    var postdata = {
        page: state.providerpage,
        search: $("#find-provider-provider").val(),
        subject: parseFloat($('#find-provider-subject').val()) || null,
        postcode: $("#find-provider-postcode").val(),
        distance: parseInt($("#find-provider-distance").val()) || null,
        sortby: $("#sortby").val()
    }

    fetchProviders({
        force: reset,
        postdata: postdata,
        holdTheLine: reset ? function () {
            $("#scrollTo").show();
            $("#providers-all").html("");
            $(".datatooltip").remove();
        } : null,
        callback: function (result, locationFound, end) {
            if (end) {
                $("#scrollTo").hide();
                var noResultsAtAll = result.length + $(".singleProvider").length === 0;
                if (noResultsAtAll) {
                    $("#noResults").show();
                }
            } 
            state.providerpage += 1;
            
            if (reset) {
                $("#scrollTo").show();
                $("#providers-all").html("");
                $(".datatooltip").remove();
            }

            if (!locationFound) {
                if ($("#sortby").val() === "distance") {
                    $("#sortby").val("name");
                }
                $("#sortby [value='distance']").prop("disabled", true);
            } else {
                $("#sortby [value='distance']").prop("disabled", false);
            }

            var rendered = Mustache.render($('#bunchOfProviders-template').html(), result);
            $('#providers-all').append(rendered);
            injectDataIntoNewGraphContainers(result, postdata.subject);
            renderNewGraphs();

            var currentProviderUnknown = currentRequestedProvider() && $(".singleProvider[data-ukprn='"+ currentRequestedProvider() +"']").length === 0;
            if (currentProviderUnknown) {
                renderMoreProviders();
            } else {
                // check if the loading indicator is still in view
                // (the timeout ensures rendering completes before
                setTimeout(checkScrollState);
            }
        }
    })
}

function getProviderDetails(ukprn) {
    state.lastprn = ukprn;

    fetchProviderDetails({
        ukprn: ukprn,
        holdTheLine: function () {
            setMode("view-details");
            $("#details-container").html(Mustache.render($("#loading-template").html(), { message: "Loading, please wait&hellip;" }));
        },
        callback: function (provider) {
            setMode("view-details");
            $(window).scrollTop(0);
            var rendered = Mustache.render($('#providerDetails-template').html(), provider);
            $('#details-container').html(rendered);
            injectDataIntoNewGraphContainers([provider])
            renderNewGraphs();
            $('#subject-sortby').change();
        }
    })
}

function injectDataIntoNewGraphContainers(results, primarysubject) {
    var lot = $(".graph-container.empty")
    lot.each(function (i, elem) {
        $(elem).data("ukprn");
        var prov = _(results).find(function (x) { return x.ukprn === $(elem).data("ukprn") });
        if (!prov) { return; }
        var subject = $(elem).data("subjectcode") || primarysubject || 0;
        var data = _(prov.apprenticeships).find(function (x) { return x.subject_tier_2_code === subject });
        $(elem).prop("__data__", data.performanceData);
    });
}

var checkScrollState = debounce(function () {
    if (isInView($("#scrollTo"), 100)) {
        renderMoreProviders();
    }
}, 50);




