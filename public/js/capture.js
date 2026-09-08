const inputName = document.getElementById('inputName');
const inputPhone = document.getElementById('inputPhone');
const consentBox = document.getElementById('consentBox');
const enhancedQualityBox = document.getElementById('enhancedQualityBox');
const btnStart = document.getElementById('btnStart');

function validateCapture(){
  const ok = inputName.value.trim().length > 1 && inputPhone.value.trim().length >= 7 && consentBox.checked;
  btnStart.disabled = !ok;
}
[inputName, inputPhone].forEach(el => el.addEventListener('input', validateCapture));
consentBox.addEventListener('change', validateCapture);
// Was only ever called reactively (on input/change) — harmless while the
// fields were prefilled with valid defaults, but left the Start button
// wrongly enabled from a blank page load now that they aren't (2026-09-09
// user request to stop prefilling name/phone).
validateCapture();

btnStart.addEventListener('click', () => {
  state.name = inputName.value.trim() || 'Vatsal';
  state.phone = inputPhone.value.trim() || '+918879185247';
  state.enhancedQuality = enhancedQualityBox.checked;
  if (window.track) track('login', { name: state.name, phone: state.phone, method: 'start_button', enhancedQuality: state.enhancedQuality });
  enterSoftLaunch();
});
document.getElementById('btnBypass').addEventListener('click', () => {
  state.name = 'Vatsal';
  state.phone = '+918879185247';
  state.enhancedQuality = enhancedQualityBox.checked;
  if (window.track) track('login', { name: state.name, phone: state.phone, method: 'bypass', enhancedQuality: state.enhancedQuality });
  enterSoftLaunch();
});

