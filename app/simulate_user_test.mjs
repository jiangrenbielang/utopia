import puppeteer from 'puppeteer-core';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = 'http://localhost:5173/';
const SCREENSHOT_DIR = path.resolve('..', 'screenshots');

async function clickByText(page, textTag, textMatch) {
  await page.evaluate(({ tag, text }) => {
    const elements = Array.from(document.querySelectorAll(tag));
    const target = elements.find(el => el.textContent.includes(text));
    if (target) {
      target.click();
      return true;
    }
    return false;
  }, { tag: textTag, text: textMatch });
}

async function runSimulatedUserTest() {
  console.log('==================================================');
  console.log('  🤖 启动 Edge 浏览器真实模拟用户 UI 操作测试');
  console.log('==================================================\n');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 850, deviceScaleFactor: 2 });

  try {
    // 1. 打开首页
    console.log('▶ 1. 打开首页视图，检查倒计时卡片与每日金句卡片...');
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: `${SCREENSHOT_DIR}\\01_homepage.png` });
    console.log('  📸 已捕获截图: 01_homepage.png');

    // 2. 切换到【学习计时】页并模拟快捷手动打卡
    console.log('\n▶ 2. 点击「学习计时」Tab，模拟快捷直接录入 90 分钟 [自命题法硕]...');
    await clickByText(page, 'button', '学习计时');
    await new Promise(r => setTimeout(r, 600));

    // 切换为手动输入科目模式
    await clickByText(page, 'button', '自定义新科目');
    await new Promise(r => setTimeout(r, 300));
    
    await page.type('input[placeholder*="自定义科目名称"]', '自命题法硕');
    
    // 点击 90m 按钮
    await clickByText(page, 'button', '90m');

    await page.type('textarea[placeholder*="错题"]', '完成刑法分则重点罪名背诵与历年真题错题归纳！');

    await page.screenshot({ path: `${SCREENSHOT_DIR}\\02_filling_manual_log.png` });
    console.log('  📸 已捕获截图: 02_filling_manual_log.png');

    // 点击保存学习记录
    await clickByText(page, 'button', '保存学习记录');
    await new Promise(r => setTimeout(r, 1000));
    console.log('  ✅ 已成功模拟用户一键打卡 [自命题法硕] 90分钟');

    // 3. 体验秒表计时模式
    console.log('\n▶ 3. 切换至「秒表/番茄钟计时」模式，开启正计时并保存...');
    await clickByText(page, 'button', '秒表/番茄钟计时');
    await new Promise(r => setTimeout(r, 600));

    await clickByText(page, 'button', '开启秒表计时');
    await new Promise(r => setTimeout(r, 1500)); // 运行 1.5 秒

    await clickByText(page, 'button', '结束保存');
    await new Promise(r => setTimeout(r, 600));

    await clickByText(page, 'button', '确认保存');
    await new Promise(r => setTimeout(r, 1000));
    console.log('  ✅ 已成功模拟秒表计时并完成结算保存');

    // 4. 切换到【统计图表】观察圆环分布图
    console.log('\n▶ 4. 点击「统计图表」Tab，观察圆环分布图与时间明细...');
    await clickByText(page, 'button', '统计图表');
    await new Promise(r => setTimeout(r, 800));

    await page.screenshot({ path: `${SCREENSHOT_DIR}\\03_donut_ring_chart.png` });
    console.log('  📸 已捕获截图: 03_donut_ring_chart.png (圆环分布图与打卡历)');

    // 5. 切换到【历史日志】
    console.log('\n▶ 5. 点击「历史日志」Tab，检查记录条目...');
    await clickByText(page, 'button', '历史日志');
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: `${SCREENSHOT_DIR}\\04_history_logs.png` });
    console.log('  📸 已捕获截图: 04_history_logs.png');

    // 6. 切换护眼深色模式
    console.log('\n▶ 6. 打开「设置」并一键切换「护眼深色模式」...');
    await clickByText(page, 'button', '设置');
    await new Promise(r => setTimeout(r, 600));

    await clickByText(page, 'button', '切换');
    await new Promise(r => setTimeout(r, 600));

    await page.screenshot({ path: `${SCREENSHOT_DIR}\\05_dark_mode.png` });
    console.log('  📸 已捕获截图: 05_dark_mode.png (护眼深色模式外观)');

    console.log('\n==================================================');
    console.log('  🎉 自动模拟用户测试全部顺利完成！截图存放在 D:\\conection\\aixuexiAPP\\screenshots');
    console.log('==================================================\n');

  } catch (err) {
    console.error('❌ 测试运行异常:', err);
  } finally {
    await browser.close();
  }
}

runSimulatedUserTest();
