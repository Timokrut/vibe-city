import { readProfile, nicknameLimit } from "./profile.js";
import { icon } from "./icons.js";

const storageKey = "atlas-player-profiles-v1";
export function loadProfiles() {
  const defaults = [readProfile(), readProfile()];
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return defaults.map((empty, seat) =>
      saved?.[seat] ? readProfile(saved[seat]) : empty,
    );
  } catch {
    return defaults;
  }
}

export function avatarMarkup(profile, fallback = "pin") {
  const content = profile?.avatar
    ? '<img src="' + profile.avatar + '" alt="">'
    : icon(fallback, 20);
  return '<span class="avatar" aria-hidden="true">' + content + "</span>";
}

async function thumbnail(file) {
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    image.src = url;
    await image.decode();
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f9f7f0";
    context.fillRect(0, 0, 96, 96);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      96,
      96,
    );
    return readProfile({ avatar: canvas.toDataURL("image/jpeg", 0.84) }).avatar;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function editProfile({
  seat,
  profiles,
  title,
  placeholder,
  t,
  dialog,
  modal,
  onSave,
}) {
  const draft = { ...profiles[seat] };
  dialog(
    title,
    `<form class="profile-editor">
    <div class="photo-row"><div class="photo-preview"></div><div>
      <button type="button" class="chip on" data-upload>${t("Выбрать фото", "Choose photo")}</button>
      <button type="button" class="link-btn" data-remove>${t("Убрать фото", "Remove photo")}</button>
      <input type="file" accept="image/jpeg,image/png,image/webp" hidden>
      <p class="sub">${t("JPG, PNG или WebP · до 5 МБ", "JPG, PNG or WebP · up to 5 MB")}</p>
    </div></div>
    <label>${t("Никнейм", "Nickname")}<input name="nickname" maxlength="${nicknameLimit}" autocomplete="off" placeholder="${placeholder}"></label>
    <p class="notice" role="status"></p>
    <div class="modal-actions"><button type="button" class="plain" data-close>${t("Отмена", "Cancel")}</button>
    <button type="submit" class="primary">${t("Сохранить", "Save")}</button></div></form>`,
  );
  const form = modal.querySelector("form");
  const fileInput = form.querySelector('[type="file"]');
  const upload = form.querySelector("[data-upload]");
  const remove = form.querySelector("[data-remove]");
  const save = form.querySelector('[type="submit"]');
  const notice = form.querySelector(".notice");
  const name = form.elements.nickname;
  name.value = draft.nickname;
  function preview() {
    form.querySelector(".photo-preview").innerHTML = avatarMarkup(draft);
    remove.hidden = !draft.avatar;
  }
  preview();
  upload.onclick = () => fileInput.click();
  remove.onclick = () => {
    draft.avatar = "";
    notice.textContent = "";
    preview();
  };
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.value = "";
    notice.textContent = "";
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      notice.textContent = t(
        "Выберите JPG, PNG или WebP размером до 5 МБ.",
        "Choose a JPG, PNG or WebP image up to 5 MB.",
      );
      return;
    }
    save.disabled = upload.disabled = remove.disabled = true;
    try {
      draft.avatar = await thumbnail(file);
      preview();
    } catch {
      notice.textContent = t(
        "Не удалось открыть изображение.",
        "Could not open this image.",
      );
    } finally {
      save.disabled = upload.disabled = remove.disabled = false;
    }
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    if (save.disabled) return;
    let next;
    try {
      next = readProfile({ ...draft, nickname: name.value });
    } catch {
      notice.textContent = t("Проверьте никнейм.", "Check your nickname.");
      return;
    }
    const updated = profiles.slice();
    updated[seat] = next;
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      notice.textContent = t(
        "Браузеру не удалось сохранить профиль.",
        "Your browser could not save this profile.",
      );
      return;
    }
    modal.close();
    onSave(updated);
  };
  name.focus();
}
