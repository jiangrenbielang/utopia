import { describe, expect, it } from 'vitest';
import { buildCategoryQuery, parseCmsClasses, parseCmsFilters } from './cms-category';

/**
 * 分类浏览纯函数单测：分类列表解析（字段别名 / 坏数据跳过）、筛选定义解析、
 * 以及查询串拼装（`f` 的 JSON 编码、base 末尾斜杠归一化）。
 */

describe('parseCmsClasses', () => {
  it('按上游 class[] 解析出 {id,name,pid}', () => {
    const classes = parseCmsClasses({
      class: [
        { type_id: 1, type_pid: 0, type_name: '电影' },
        { type_id: '2', type_pid: '0', type_name: '连续剧' },
        { type_id: 20, type_pid: 2, type_name: '国产剧' },
      ],
    });

    expect(classes).toEqual([
      { id: '1', name: '电影', pid: '0' },
      { id: '2', name: '连续剧', pid: '0' },
      { id: '20', name: '国产剧', pid: '2' },
    ]);
  });

  it('兼容 id / name 别名与数字型 id', () => {
    const classes = parseCmsClasses({ class: [{ id: 7, name: '动漫' }] });
    expect(classes).toEqual([{ id: '7', name: '动漫' }]);
  });

  it('缺 id 或 name 的条目跳过，重复 id 只留第一条', () => {
    const classes = parseCmsClasses({
      class: [
        { type_id: 1, type_name: '电影' },
        { type_name: '没有 id' },
        { type_id: 2 },
        null,
        'x',
        { type_id: 1, type_name: '电影（重复）' },
      ],
    });

    expect(classes).toEqual([{ id: '1', name: '电影' }]);
  });

  it('class 缺失 / 非数组时返回空数组', () => {
    expect(parseCmsClasses(null)).toEqual([]);
    expect(parseCmsClasses({})).toEqual([]);
    expect(parseCmsClasses({ class: null })).toEqual([]);
    expect(parseCmsClasses({ class: { type_id: 1 } })).toEqual([]);
  });
});

describe('parseCmsFilters', () => {
  it('解析 filters：key/name/init/value[{n,v}]', () => {
    const filters = parseCmsFilters({
      filters: {
        '1': [
          {
            key: 'area',
            name: '地区',
            init: '大陆',
            value: [
              { n: '全部', v: '' },
              { n: '大陆', v: '大陆' },
              { n: '香港', v: '香港' },
            ],
          },
        ],
      },
    });

    expect(filters).toEqual({
      '1': [
        {
          key: 'area',
          name: '地区',
          init: '大陆',
          value: [
            { n: '全部', v: '' },
            { n: '大陆', v: '大陆' },
            { n: '香港', v: '香港' },
          ],
        },
      ],
    });
  });

  it('缺 key / name 的分组跳过，缺 n 的取值跳过，缺 v 按空串处理', () => {
    const filters = parseCmsFilters({
      filters: {
        '2': [
          { name: '没有 key', value: [{ n: 'A', v: 'a' }] },
          { key: 'year', value: [{ n: '2024', v: '2024' }] },
          { key: 'sort', name: '排序', value: [{ v: 'hot' }, { n: '最新', v: 'new' }, null] },
        ],
      },
    });

    expect(filters).toEqual({
      '2': [{ key: 'sort', name: '排序', value: [{ n: '最新', v: 'new' }] }],
    });
  });

  it('value 为空数组或不存在的分组不返回', () => {
    const filters = parseCmsFilters({
      filters: {
        '3': [
          { key: 'a', name: 'A', value: [] },
          { key: 'b', name: 'B' },
          { key: 'c', name: 'C', value: 'oops' },
        ],
      },
    });
    expect(filters).toEqual({});
  });

  it('分类条目不是数组 / filters 缺失时返回空对象', () => {
    expect(parseCmsFilters({ filters: { '1': 'x' } })).toEqual({});
    expect(parseCmsFilters({})).toEqual({});
    expect(parseCmsFilters({ filters: [] })).toEqual({});
  });
});

describe('buildCategoryQuery', () => {
  it('base 末尾斜杠归一化，只带 ac', () => {
    expect(buildCategoryQuery('https://vod.example.com/api.php/provide/vod/', { ac: 'list' })).toBe(
      'https://vod.example.com/api.php/provide/vod?ac=list'
    );
    expect(buildCategoryQuery('https://vod.example.com/api.php/provide/vod///', { ac: 'list' })).toBe(
      'https://vod.example.com/api.php/provide/vod?ac=list'
    );
  });

  it('分类与页码按 t/pg 拼装', () => {
    expect(
      buildCategoryQuery('https://vod.example.com/api.php/provide/vod', {
        ac: 'videolist',
        t: '20',
        pg: 3,
      })
    ).toBe('https://vod.example.com/api.php/provide/vod?ac=videolist&t=20&pg=3');
  });

  it('pg 非法时回落为 1；未传 pg 时不拼该参数', () => {
    expect(buildCategoryQuery('https://a.example.com/api', { ac: 'videolist', pg: 0 })).toBe(
      'https://a.example.com/api?ac=videolist&pg=1'
    );
    expect(buildCategoryQuery('https://a.example.com/api', { ac: 'list' })).toBe('https://a.example.com/api?ac=list');
  });

  it('f 传键值对时序列化为 JSON 并 URL 编码', () => {
    const url = buildCategoryQuery('https://a.example.com/api', {
      ac: 'videolist',
      t: '1',
      pg: 1,
      f: { area: '大陆', year: '2024' },
    });
    expect(url).toBe(
      `https://a.example.com/api?ac=videolist&t=1&pg=1&f=${encodeURIComponent('{"area":"大陆","year":"2024"}')}`
    );
    // 编码后可被正常解析回来
    const f = new URL(url).searchParams.get('f');
    expect(JSON.parse(f as string)).toEqual({ area: '大陆', year: '2024' });
  });

  it('f 传字符串时按已序列化的 JSON 原样编码', () => {
    const url = buildCategoryQuery('https://a.example.com/api', { ac: 'videolist', f: '{"area":"香港"}' });
    expect(url).toBe(`https://a.example.com/api?ac=videolist&f=${encodeURIComponent('{"area":"香港"}')}`);
  });

  it('f 为空对象 / 空串 / 未传时不拼该参数', () => {
    expect(buildCategoryQuery('https://a.example.com/api', { ac: 'videolist', f: {} })).toBe(
      'https://a.example.com/api?ac=videolist'
    );
    expect(buildCategoryQuery('https://a.example.com/api', { ac: 'videolist', f: '' })).toBe(
      'https://a.example.com/api?ac=videolist'
    );
  });

  it('t 为空串时不拼该参数（表示不限分类）', () => {
    expect(buildCategoryQuery('https://a.example.com/api', { ac: 'videolist', t: '', pg: 2 })).toBe(
      'https://a.example.com/api?ac=videolist&pg=2'
    );
  });

  it('base 自身带查询串时用 & 连接（真实配置里存在 api 写死 ?ac=list 的站点）', () => {
    expect(
      buildCategoryQuery('https://apiyutu.com/api.php/provide/vod/?ac=list', {
        ac: 'videolist',
        t: '6',
        pg: 2,
      })
    ).toBe('https://apiyutu.com/api.php/provide/vod/?ac=list&ac=videolist&t=6&pg=2');
  });

  it('base 以 ? 或 & 结尾时不产生空参数', () => {
    expect(buildCategoryQuery('https://a.example.com/api?', { ac: 'list' })).toBe(
      'https://a.example.com/api?ac=list'
    );
    expect(buildCategoryQuery('https://a.example.com/api?x=1&', { ac: 'list' })).toBe(
      'https://a.example.com/api?x=1&ac=list'
    );
  });
});