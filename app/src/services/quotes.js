/* Utopia · 考研励志与备考金句 (Motivational Quotes) */

export const KAOYAN_QUOTES = [
  { text: "长路漫漫，终有归途。日复一日的坚持，终将汇聚成耀眼的光芒。", author: "Utopia" },
  { text: "考研不是为了超越别人，而是为了成为那个你一直向往的自己。", author: "Utopia" },
  { text: "高数多做一道题，考场多拿两分；英文多记一个词，复试多一分胜算。", author: "备考箴言" },
  { text: "你所熬过的每一个夜晚，都在悄悄为你搭起通往一等奖学金与心仪院校的阶梯。", author: "Utopia" },
  { text: "星光不问赶路人，时光不负考研人。合上笔盖的那一刻，一定会有拔剑出鞘的骄傲！", author: "Utopia" },
  { text: "沉心静气，按部就班。不要焦虑未知的答案，脚下的每一步都算数。", author: "Utopia" },
  { text: "种一棵树最好的时间是十年前，其次就是现在。专注当下这一刻！", author: "Utopia" }
];

export function getRandomQuote() {
  const index = Math.floor(Math.random() * KAOYAN_QUOTES.length);
  return KAOYAN_QUOTES[index];
}
