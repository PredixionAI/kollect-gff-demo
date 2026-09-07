const inputName = document.getElementById('inputName');
const inputPhone = document.getElementById('inputPhone');
const consentBox = document.getElementById('consentBox');
const btnStart = document.getElementById('btnStart');

function validateCapture(){
  const ok = inputName.value.trim().length > 1 && inputPhone.value.trim().length >= 7 && consentBox.checked;
  btnStart.disabled = !ok;
}
[inputName, inputPhone].forEach(el => el.addEventListener('input', validateCapture));
consentBox.addEventListener('change', validateCapture);

btnStart.addEventListener('click', () => {
  state.name = inputName.value.trim() || 'Vatsal';
  state.phone = inputPhone.value.trim() || '+918879185247';
  if (window.track) track('login', { name: state.name, phone: state.phone, method: 'start_button' });
  enterSoftLaunch();
});
document.getElementById('btnBypass').addEventListener('click', () => {
  state.name = 'Vatsal';
  state.phone = '+918879185247';
  if (window.track) track('login', { name: state.name, phone: state.phone, method: 'bypass' });
  enterSoftLaunch();
});

