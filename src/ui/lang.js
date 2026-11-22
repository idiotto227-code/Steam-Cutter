const strings={
autoSteam:['Открывать Steam после нарезки','Відкривати Steam після нарізання','Open Steam after slicing'],
studio:['Студия витрин','Студія вітрин','Showcase studio'],offline:['Локальная обработка','Локальна обробка','Local processing'],
preview:['Предпросмотр','Передперегляд','Preview'],example:['ПРИМЕР','ПРИКЛАД','EXAMPLE'],result:['РЕЗУЛЬТАТ','РЕЗУЛЬТАТ','EXPORT'],
layout:['Тип витрины','Тип вітрини','Showcase layout'],workshop:['Моя мастерская','Моя майстерня','My Workshop'],artwork:['Иллюстрации','Ілюстрації','Artwork'],
source:['Источник','Джерело','Source'],file:['С компьютера','З комп’ютера','Computer'],url:['Ссылка','Посилання','Link'],inbox:['Входящие','Вхідні','Inbox'],
drop:['Перетащите изображения в окно','Перетягніть зображення у вікно','Drop images anywhere in this window'],choose:['Выбрать и нарезать','Вибрати й нарізати','Choose and slice'],
linkLabel:['Ссылка на изображение или страницу','Посилання на зображення або сторінку','Image or webpage URL'],linkHint:['Для страницы берётся её главное изображение.','Для сторінки береться її головне зображення.','For webpages, the main image is used.'],
process:['Загрузить и нарезать','Завантажити й нарізати','Import and slice'],inboxHint:['Положите изображения в папку «Входящие».','Додайте зображення до папки «Вхідні».','Place your images in the Inbox folder.'],
openInbox:['Открыть «Входящие»','Відкрити «Вхідні»','Open Inbox folder'],processAll:['Обработать папку','Обробити папку','Process folder'],
saveTo:['Сохранять в','Зберігати в','Save to'],change:['Изменить','Змінити','Change'],jobs:['Обработка','Обробка','Activity'],
queued:['В очереди','У черзі','Queued'],reading:['Открываю файл…','Відкриваю файл…','Opening file…'],fetching:['Получаю изображение…','Завантажую зображення…','Fetching image…'],
cutting:['Нарезка','Нарізання','Slicing'],optimizing:['Подгонка размера','Оптимізація розміру','Optimizing size'],saving:['Сохранение…','Збереження…','Saving…'],
saved:['Готово','Готово','Ready'],folder:['Папка','Папка','Folder'],publish:['Открыть в Steam','Відкрити в Steam','Open in Steam'],
empty:['Во «Входящих» пока нет поддерживаемых изображений.','У папці «Вхідні» ще немає підтримуваних зображень.','The Inbox has no supported images yet.'],
unsupported:['Не удалось прочитать изображение. Поддерживаются GIF, PNG, JPG и WebP.','Не вдалося прочитати зображення. Підтримуються GIF, PNG, JPG і WebP.','Cannot read this image. Supported formats are GIF, PNG, JPG and WebP.'],
tooBig:['Максимальный размер входного файла — 32 МиБ.','Максимальний розмір вхідного файлу — 32 МіБ.','The input file limit is 32 MiB.'],
dimensions:['Слишком большое изображение. Предел — 48 Мп и 4096 пикселей высоты результата.','Завелике зображення. Межа — 48 Мп і 4096 пікселів висоти результату.','Image too large. Limit: 48 MP and 4096 px output height.'],
complex:['Анимация слишком длинная. Укоротите её или уменьшите исходное разрешение.','Анімація задовга. Скоротіть її або зменште початкову роздільність.','Animation too large. Shorten it or reduce its original resolution.'],
runtime:['Обновите Microsoft Edge WebView2 Runtime для декодирования изображений.','Оновіть Microsoft Edge WebView2 Runtime для декодування зображень.','Update Microsoft Edge WebView2 Runtime to decode images.'],
overBudget:['Даже после оптимизации часть превышает 5 МБ. Укоротите анимацию.','Навіть після оптимізації частина перевищує 5 МБ. Скоротіть анімацію.','A file still exceeds 5 MB after optimization. Shorten the animation.'],
urlInvalid:['Укажите общедоступную ссылку HTTP или HTTPS.','Вкажіть загальнодоступне посилання HTTP або HTTPS.','Enter a public HTTP or HTTPS URL.'],
noImage:['На странице не найдено подходящее изображение. Вставьте прямую ссылку на файл.','На сторінці не знайдено зображення. Вставте пряме посилання на файл.','No suitable image on the page. Paste a direct image link.'],
frames:['кадр.','кадр.','frames'],files:['файлов','файлів','files'],failed:['Ошибка','Помилка','Error'],cancel:['Отменить','Скасувати','Cancel'],cancelled:['Отменено','Скасовано','Cancelled'],
again:['Ещё раз','Ще раз','Retry'],network:['Не удалось загрузить ссылку','Не вдалося завантажити посилання','Could not load this URL']
};
export const languages=['ru','uk','en'];
export function translate(key,lang){return strings[key]?.[languages.indexOf(lang)] ?? key;}
