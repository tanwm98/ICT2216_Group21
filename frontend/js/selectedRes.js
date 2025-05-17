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
            text.innerHTML = paxSummary;
        });
    });

    displaySpecificStore(); 
};


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

        const left = document.getElementById('left-side');
        left.innerHTML = "";

        const storeName = document.createElement("h1");
        storeName.innerHTML = stores[0].storeName;

        const link = document.createElement('a');
        link.href = "#";

        const img = document.createElement('img');
        img.style.width = "700px";
        img.style.height = "400px";
        img.style.objectFit = "cover";
        img.src = stores[0].image;
        img.alt = 'Post Image';

        link.appendChild(img);
        left.append(storeName, link);

    } catch (error) {
        console.error('Error:', error);
    }
}
