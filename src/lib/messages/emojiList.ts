// The emoji offered in chat: in the message box and as reactions. Each comes with a
// few words, so the picker can be searched. Emoji are ordinary characters, so nothing
// is downloaded and every device draws them in its own style.

export type EmojiEntry = readonly [emoji: string, words: string];

export type EmojiCategory = { key: string; label: string; icon: string; emoji: readonly EmojiEntry[] };

// The six quick reactions, as in WhatsApp.
export const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

export const emojiCategories: readonly EmojiCategory[] = [
  {
    key: 'smileys',
    label: 'Smileys',
    icon: '😀',
    emoji: [
      ['😀', 'grinning smile happy'], ['😃', 'smile happy'], ['😄', 'smile happy laugh'], ['😁', 'grin beaming'],
      ['😆', 'laughing'], ['😅', 'sweat smile relief'], ['🤣', 'rolling laughing rofl'], ['😂', 'joy tears laugh lol'],
      ['🙂', 'slight smile'], ['🙃', 'upside down'], ['😉', 'wink'], ['😊', 'blush smile'],
      ['😇', 'innocent halo angel'], ['🥰', 'love hearts'], ['😍', 'heart eyes love'], ['🤩', 'star struck wow'],
      ['😘', 'kiss'], ['😋', 'yum tasty'], ['😛', 'tongue'], ['😜', 'wink tongue crazy'],
      ['🤪', 'zany crazy'], ['🤑', 'money'], ['🤗', 'hug'], ['🤭', 'oops giggle'],
      ['🤫', 'shush quiet'], ['🤔', 'thinking hmm'], ['🤐', 'zipper mouth secret'], ['🤨', 'raised eyebrow doubt'],
      ['😐', 'neutral'], ['😑', 'expressionless'], ['😶', 'no mouth speechless'], ['😏', 'smirk'],
      ['😒', 'unamused'], ['🙄', 'eye roll'], ['😬', 'grimace awkward'], ['😌', 'relieved calm'],
      ['😔', 'pensive sad'], ['😪', 'sleepy'], ['😴', 'sleeping tired'], ['😷', 'mask sick'],
      ['🤒', 'fever sick'], ['🤕', 'hurt bandage'], ['🤢', 'nauseated'], ['🤧', 'sneeze cold'],
      ['🥵', 'hot'], ['🥶', 'cold freezing'], ['😵', 'dizzy'], ['🤯', 'mind blown'],
      ['🥳', 'party celebrate'], ['😎', 'cool sunglasses'], ['🤓', 'nerd'], ['🧐', 'monocle inspect'],
      ['😕', 'confused'], ['😟', 'worried'], ['🙁', 'frown'], ['😮', 'wow surprised open mouth'],
      ['😯', 'hushed'], ['😲', 'astonished shocked'], ['😳', 'flushed embarrassed'], ['🥺', 'pleading please'],
      ['😦', 'frowning'], ['😧', 'anguished'], ['😨', 'fearful scared'], ['😰', 'anxious sweat'],
      ['😥', 'sad relieved'], ['😢', 'cry sad tear'], ['😭', 'sob crying'], ['😱', 'scream fear'],
      ['😖', 'confounded'], ['😣', 'persevere'], ['😞', 'disappointed'], ['😓', 'downcast sweat'],
      ['😩', 'weary'], ['😫', 'tired'], ['🥱', 'yawn bored'], ['😤', 'triumph huff'],
      ['😡', 'angry pout'], ['😠', 'angry mad'], ['🤬', 'cursing swearing'], ['😈', 'devil smiling'],
      ['💀', 'skull dead'], ['💩', 'poop'], ['🤡', 'clown'], ['👻', 'ghost'],
      ['👽', 'alien'], ['🤖', 'robot'], ['😺', 'cat smile'], ['🙈', 'see no evil monkey'],
      ['🙉', 'hear no evil monkey'], ['🙊', 'speak no evil monkey'],
    ],
  },
  {
    key: 'gestures',
    label: 'People and gestures',
    icon: '👍',
    emoji: [
      ['👍', 'thumbs up yes ok like'], ['👎', 'thumbs down no dislike'], ['👌', 'ok perfect'], ['✌️', 'victory peace'],
      ['🤞', 'fingers crossed luck'], ['🤟', 'love you'], ['🤘', 'rock on'], ['🤙', 'call me'],
      ['👈', 'point left'], ['👉', 'point right'], ['👆', 'point up'], ['👇', 'point down'],
      ['☝️', 'index up'], ['✋', 'raised hand stop'], ['🤚', 'raised back hand'], ['🖐️', 'hand fingers'],
      ['🖖', 'vulcan'], ['👋', 'wave hello bye'], ['🤝', 'handshake deal'], ['🙏', 'pray thanks please namaste'],
      ['👏', 'clap applause'], ['🙌', 'raising hands celebrate'], ['👐', 'open hands'], ['🤲', 'palms up'],
      ['✊', 'raised fist'], ['👊', 'fist bump'], ['💪', 'strong muscle flex'], ['✍️', 'writing'],
      ['🫡', 'salute'], ['🫶', 'heart hands'], ['👀', 'eyes look'], ['🧠', 'brain smart'],
      ['🙋', 'raising hand question'], ['🙆', 'ok gesture'], ['🙅', 'no gesture'], ['🤷', 'shrug dunno'],
      ['🤦', 'facepalm'], ['🙇', 'bow sorry'], ['💁', 'tipping hand info'], ['🧑‍💻', 'technologist developer coder'],
      ['👨‍💼', 'office worker man'], ['👩‍💼', 'office worker woman'], ['🧑‍🎨', 'artist designer'], ['🧑‍🏫', 'teacher'],
      ['🏃', 'running hurry'], ['🚶', 'walking'], ['💃', 'dancing'], ['🕺', 'dancing man'],
      ['👪', 'family'], ['🎅', 'santa christmas'],
    ],
  },
  {
    key: 'hearts',
    label: 'Hearts and symbols',
    icon: '❤️',
    emoji: [
      ['❤️', 'red heart love'], ['🧡', 'orange heart'], ['💛', 'yellow heart'], ['💚', 'green heart'],
      ['💙', 'blue heart'], ['💜', 'purple heart'], ['🖤', 'black heart'], ['🤍', 'white heart'],
      ['🤎', 'brown heart'], ['💔', 'broken heart'], ['❣️', 'heart exclamation'], ['💕', 'two hearts'],
      ['💞', 'revolving hearts'], ['💓', 'beating heart'], ['💗', 'growing heart'], ['💖', 'sparkling heart'],
      ['💘', 'cupid arrow'], ['💝', 'heart gift'], ['💯', 'hundred perfect'], ['✅', 'check done yes'],
      ['☑️', 'ballot check'], ['✔️', 'tick done'], ['❌', 'cross no wrong'], ['❎', 'cross button'],
      ['⭕', 'circle'], ['🚫', 'prohibited no'], ['⛔', 'no entry stop'], ['❗', 'exclamation important'],
      ['❓', 'question'], ['‼️', 'double exclamation'], ['⁉️', 'exclamation question'], ['⚠️', 'warning'],
      ['🔥', 'fire hot lit'], ['✨', 'sparkles'], ['⭐', 'star'], ['🌟', 'glowing star'],
      ['💫', 'dizzy star'], ['💥', 'boom collision'], ['💢', 'anger'], ['💬', 'speech bubble chat'],
      ['💭', 'thought bubble'], ['💤', 'sleep zzz'], ['🎉', 'party popper congrats tada'], ['🎊', 'confetti'],
      ['🔔', 'bell notification'], ['🔕', 'bell off mute'], ['📌', 'pin'], ['📍', 'location pin'],
      ['🟢', 'green circle online'], ['🟡', 'yellow circle'], ['🔴', 'red circle'], ['🔵', 'blue circle'],
      ['➕', 'plus add'], ['➖', 'minus'], ['➡️', 'arrow right'], ['⬅️', 'arrow left'],
      ['⬆️', 'arrow up'], ['⬇️', 'arrow down'], ['🔄', 'repeat refresh'], ['🆗', 'ok button'],
      ['🆕', 'new'], ['🆘', 'sos help'],
    ],
  },
  {
    key: 'work',
    label: 'Work and objects',
    icon: '💼',
    emoji: [
      ['💼', 'briefcase work'], ['📁', 'folder'], ['📂', 'open folder'], ['📄', 'document page'],
      ['📝', 'memo note write'], ['📋', 'clipboard'], ['📊', 'bar chart report'], ['📈', 'chart up growth'],
      ['📉', 'chart down'], ['📅', 'calendar date'], ['🗓️', 'calendar spiral'], ['⏰', 'alarm clock'],
      ['⏳', 'hourglass waiting'], ['⌛', 'hourglass done'], ['🕒', 'clock time'], ['💻', 'laptop computer'],
      ['🖥️', 'desktop computer'], ['⌨️', 'keyboard'], ['🖱️', 'mouse'], ['📱', 'phone mobile'],
      ['☎️', 'telephone'], ['📞', 'phone call'], ['📧', 'email'], ['✉️', 'envelope mail'],
      ['📨', 'incoming mail'], ['📎', 'paperclip attach'], ['✏️', 'pencil edit'], ['🖊️', 'pen'],
      ['🔍', 'search magnify'], ['🔒', 'lock secure'], ['🔓', 'unlock'], ['🔑', 'key'],
      ['💡', 'idea bulb'], ['🔧', 'wrench fix'], ['🛠️', 'tools'], ['⚙️', 'gear settings'],
      ['🧾', 'receipt invoice'], ['💰', 'money bag'], ['💵', 'cash dollar'], ['💳', 'credit card'],
      ['🏦', 'bank'], ['🪙', 'coin'], ['📦', 'package box'], ['🎯', 'target goal'],
      ['🏆', 'trophy winner'], ['🥇', 'gold medal first'], ['🎁', 'gift present'], ['📣', 'megaphone announce'],
      ['📢', 'loudspeaker'], ['🚀', 'rocket launch'], ['📷', 'camera photo'], ['🎥', 'video camera'],
      ['🎧', 'headphones'], ['🎤', 'microphone'],
    ],
  },
  {
    key: 'food',
    label: 'Food and drink',
    icon: '☕',
    emoji: [
      ['☕', 'coffee tea'], ['🍵', 'tea chai'], ['🥤', 'cup drink'], ['🧃', 'juice'],
      ['🍺', 'beer'], ['🥂', 'cheers toast'], ['🍕', 'pizza'], ['🍔', 'burger'],
      ['🍟', 'fries'], ['🌭', 'hot dog'], ['🥪', 'sandwich'], ['🌮', 'taco'],
      ['🍛', 'curry rice biryani'], ['🍚', 'rice'], ['🍜', 'noodles'], ['🍝', 'pasta'],
      ['🥗', 'salad'], ['🍲', 'stew pot'], ['🥘', 'paella pan'], ['🫓', 'flatbread roti'],
      ['🍰', 'cake'], ['🎂', 'birthday cake'], ['🧁', 'cupcake'], ['🍩', 'donut'],
      ['🍪', 'cookie'], ['🍫', 'chocolate'], ['🍬', 'candy sweet'], ['🍦', 'ice cream'],
      ['🍎', 'apple'], ['🍌', 'banana'], ['🥭', 'mango'], ['🍉', 'watermelon'],
      ['🍇', 'grapes'], ['🍓', 'strawberry'], ['🥥', 'coconut'], ['🍿', 'popcorn'],
    ],
  },
  {
    key: 'nature',
    label: 'Animals and nature',
    icon: '🌿',
    emoji: [
      ['🐶', 'dog'], ['🐱', 'cat'], ['🐭', 'mouse'], ['🐰', 'rabbit'],
      ['🦊', 'fox'], ['🐻', 'bear'], ['🐼', 'panda'], ['🐨', 'koala'],
      ['🐯', 'tiger'], ['🦁', 'lion'], ['🐮', 'cow'], ['🐵', 'monkey'],
      ['🐘', 'elephant'], ['🦒', 'giraffe'], ['🐔', 'chicken'], ['🦚', 'peacock'],
      ['🦋', 'butterfly'], ['🐝', 'bee busy'], ['🐢', 'turtle slow'], ['🐍', 'snake'],
      ['🐬', 'dolphin'], ['🐳', 'whale'], ['🌸', 'blossom flower'], ['🌹', 'rose'],
      ['🌻', 'sunflower'], ['🌷', 'tulip'], ['🌱', 'seedling grow'], ['🌿', 'herb leaf'],
      ['🍀', 'clover luck'], ['🌳', 'tree'], ['🌴', 'palm tree'], ['🌵', 'cactus'],
      ['☀️', 'sun sunny'], ['🌤️', 'sun cloud'], ['⛅', 'partly cloudy'], ['🌧️', 'rain'],
      ['⛈️', 'storm thunder'], ['❄️', 'snow cold'], ['🌈', 'rainbow'], ['🌙', 'moon night'],
      ['🌍', 'earth globe world'], ['🌊', 'wave sea'],
    ],
  },
  {
    key: 'activities',
    label: 'Activities and travel',
    icon: '⚽',
    emoji: [
      ['⚽', 'football soccer'], ['🏏', 'cricket'], ['🏀', 'basketball'], ['🏸', 'badminton'],
      ['🎾', 'tennis'], ['🏓', 'table tennis'], ['🎮', 'game controller'], ['🎲', 'dice'],
      ['♟️', 'chess'], ['🎨', 'art palette design'], ['🎬', 'film clapper'], ['🎵', 'music note'],
      ['🎶', 'music notes'], ['🎸', 'guitar'], ['🏋️', 'weightlifting gym'], ['🧘', 'yoga meditate'],
      ['🚗', 'car'], ['🚕', 'taxi cab'], ['🛺', 'auto rickshaw'], ['🚌', 'bus'],
      ['🚆', 'train'], ['🚇', 'metro'], ['✈️', 'airplane flight travel'], ['🚲', 'bicycle'],
      ['🛵', 'scooter'], ['🏠', 'home house'], ['🏢', 'office building'], ['🏥', 'hospital'],
      ['🏖️', 'beach holiday'], ['⛰️', 'mountain'], ['🗺️', 'map'], ['🧳', 'luggage trip'],
      ['🪔', 'diya lamp diwali'], ['🎆', 'fireworks'], ['🎇', 'sparkler'], ['🎈', 'balloon'],
      ['🇮🇳', 'india flag'], ['🏁', 'chequered flag finish'],
    ],
  },
];

const allEmoji = emojiCategories.flatMap((category) => category.emoji);

// Emoji whose words start with what was typed, best matches first.
export function searchEmoji(query: string, limit = 64): string[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return allEmoji
    .filter(([, words]) => {
      const list = words.split(' ');
      return terms.every((term) => list.some((word) => word.startsWith(term)));
    })
    .slice(0, limit)
    .map(([emoji]) => emoji);
}

// One emoji, possibly several characters long (skin tones, flags, joined emoji). The
// database (message_reactions.emoji) refuses letters, digits, spaces and markup too.
export function isSingleEmoji(value: string) {
  if (value.length === 0 || value.length > 16) return false;
  if (/[\p{L}\p{N}\s<>&"']/u.test(value)) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value);
}
