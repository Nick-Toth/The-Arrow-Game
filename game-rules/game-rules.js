let sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
$(document).ready( () =>
{
  // This style class allows us to circumvent unwanted initial css animations.
  // Not that this will prevent all initial animations, so keep this in mind if
  // you want that behavior.
  sleep(500).then(() => {document.body.classList.remove('preload'); })
});