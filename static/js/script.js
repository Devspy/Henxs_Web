function updateCameraTime() {
	const timeElement = document.querySelector('#camera-time span');

	if (!timeElement) {
		return;
	}

	timeElement.textContent = new Date().toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
}

function updateGreeting() {
	const greetingElement = document.querySelector('#greeting');

	if (!greetingElement) {
		return;
	}

	const hour = new Date().getHours();
	let greeting = 'Good evening';

	if (hour < 12) {
		greeting = 'Good morning';
	} else if (hour < 18) {
		greeting = 'Good afternoon';
	}

	greetingElement.textContent = `${greeting}, Admin 👋`;
}

function setupAccountMenu() {
	const profileMenu = document.querySelector('.profile-menu');
	const profileToggle = document.querySelector('#profile-toggle');
	const accountMenu = document.querySelector('#account-menu');

	if (!profileMenu || !profileToggle || !accountMenu) {
		return;
	}

	function closeMenu() {
		accountMenu.hidden = true;
		profileToggle.setAttribute('aria-expanded', 'false');
	}

	profileToggle.addEventListener('click', () => {
		const isOpen = accountMenu.hidden;
		accountMenu.hidden = !isOpen;
		profileToggle.setAttribute('aria-expanded', String(isOpen));
	});

	document.addEventListener('click', (event) => {
		if (!profileMenu.contains(event.target)) {
			closeMenu();
		}
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			closeMenu();
		}
	});
}

updateCameraTime();
updateGreeting();
setupAccountMenu();
setInterval(updateCameraTime, 1000);
