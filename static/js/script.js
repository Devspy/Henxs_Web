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

updateCameraTime();
setInterval(updateCameraTime, 1000);
