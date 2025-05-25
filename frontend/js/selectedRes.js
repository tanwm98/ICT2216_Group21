window.onload = function () {
    let adultCount = 0;
    let childCount = 0;

    document.querySelectorAll('#paxCollapse .dropdown-menu a').forEach(function (item) {
        // when clicked on a value from the dropdown
        item.addEventListener('click', function (e) {
            const dropdown = this.closest('.dropdown');
            const button = dropdown.querySelector('.dropdown-toggle');
            const text = document.getElementById("paxText");

            // get number selected in the dropdown
            // this returns whichever dropdown is active now
            const selectedValue = parseInt(this.textContent);

            if (button.id === 'adultDropdown') {
                adultCount = selectedValue;
                button.textContent = `${adultCount} Adults`;
            } else if (button.id === 'childDropdown') {
                childCount = selectedValue;
                button.textContent = `${childCount} Children`;
            }

            let totalpax = `${adultCount} Adults`;
            if (childCount > 0) {
                totalpax += `, ${childCount} Children`;
            }
            text.innerHTML = totalpax;
        });
    });

    flatpickr("#calender", {
        dateFormat: "Y-m-d",
        minDate: 'today'
    });

    displaySpecificStore();
};

async function displayTimingOptions(stores) {

    const timing = document.getElementById('timing-options');
    timing.innerHTML = "";

    // for timing js
    const openTime = stores[0].opening;
    const closeTime = stores[0].closing;

    const label = document.createElement("label");
    label.innerHTML = "Choose a time: ";
    label.className = "d-block mb-2";
    timing.appendChild(label);

    // convert hours to minutes for calculation
    function toMinutes(time) {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    }

    let startMin = toMinutes(openTime);
    let closeMin = toMinutes(closeTime);

    // convert startMin (mins) to HH:MM format ( for display time )
    function changeBack(mins) {
        const hours = Math.floor(mins / 60);
        const minutes = mins % 60;
        // formatting hours & mins into HH:MM 
        // converts hours n mins to string 
        // .padStart(2, '0') -> if only 1 digit like 8, then will put 0 in front to become 08
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    // visible container to show a few timing options initially
    const visiblePart = document.createElement("div");
    // visiblePart.className = "d-flex flex-wrap mb-2";
    timing.appendChild(visiblePart);

    // hidden part 
    const hiddenPart = document.createElement('div');
    // hiddenPart.className = "d-flex flex-wrap";
    hiddenPart.style.display = 'none';
    timing.appendChild(hiddenPart);

    let count = 0;
    while (startMin < (closeMin - 30)) {
        const btn = document.createElement('button');
        btn.style.width = "70px";
        btn.style.height = "38px";
        btn.textContent = changeBack(startMin);
        btn.className = 'btn btn-outline-primary m-1';
        btn.type = 'button';

        if (count < 10) {
            visiblePart.appendChild(btn);
        } else {
            hiddenPart.appendChild(btn);
        }

        startMin += 30;
        count++;
    }

    // if there is timings in hidden part, means need to display " show more "
    if (hiddenPart.children.length > 0) {
        const showmore = document.createElement('button');
        showmore.className = "btn btn-link px-0";
        showmore.textContent = "Show more ▼";

        showmore.addEventListener('click', () => {
            const isHidden = hiddenPart.style.display === 'none';
            console.log(isHidden);
            hiddenPart.style.display = isHidden ? "unset" : "none";
            showmore.textContent = isHidden ? "Show less ▲" : "Show more ▼";
        });

        console.log(hiddenPart);

        timing.appendChild(showmore);

    }


}

async function displaySpecificStore() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const name = urlParams.get('name');
        const location = urlParams.get('location');

        const response = await fetch(`http://localhost:3000/display_specific_store?name=${encodeURIComponent(name)}&location=${encodeURIComponent(location)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }

        const stores = await response.json();
        displayTimingOptions(stores);
        navTabs(stores);

        const storeName = document.getElementById("storeName");
        storeName.innerHTML = stores[0].storeName;

        const cuisine = document.getElementById("cuisine");
        cuisine.innerHTML = stores[0].cuisine;

        const price = document.getElementById("price");
        price.innerHTML = stores[0].priceRange;

        const left = document.getElementById('left-side');
        left.innerHTML = "";

        const link = document.createElement('a');
        link.href = "#";

        const img = document.createElement('img');
        img.style.width = "650px";
        img.style.height = "450px";
        img.style.objectFit = "cover";
        img.src = stores[0].image;
        img.alt = 'Post Image';

        link.appendChild(img);
        left.append(link);

    } catch (error) {
        console.error('Error:', error);
    }
}

async function navTabs(stores) {

    // about content
    const title = document.getElementById("aboutTitle");
    title.innerHTML = `About ${stores[0].storeName}`

    const address = document.getElementById("address");
    address.innerHTML = `<i style="color:#FC6C3F" class="bi bi-geo-alt-fill mr-3"></i>${stores[0].address}, Singapore ${stores[0].postalCode}`

    const openinghours = document.getElementById("openinghours");
    openinghours.innerHTML = `<i style="color:#FC6C3F" class="bi bi-clock mr-3"></i>${stores[0].opening.slice(0, 5)} - ${stores[0].closing.slice(0, 5)}`

    // review content
    const reviewContent = document.getElementById("reviewContent");
    
}