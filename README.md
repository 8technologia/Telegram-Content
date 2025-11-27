# Telegram Auto Content Bot

Bot Telegram tự động tạo nội dung sử dụng trí tuệ nhân tạo Claude AI, với khả năng gửi kết quả đến webhook để xử lý tiếp tại n8n hoặc các hệ thống khác.

## Tác giả

**Tám Công Nghệ**

## Mục tiêu dự án

Dự án này được xây dựng với mục tiêu chính:

1. **Tự động tạo nội dung bằng AI**: Sử dụng Claude AI để tạo nội dung chất lượng cao (tiêu đề, dàn ý, bài viết hoàn chỉnh)
2. **Gửi đến Webhook**: Sau khi tạo xong, nội dung được gửi tự động đến webhook URL
3. **Xử lý tiếp tại n8n**: Webhook có thể kết nối với n8n để tiếp tục xử lý, lưu trữ, hoặc phân phối nội dung

### Luồng hoạt động

```
[User trên Telegram]
    ↓
[Bot nhận yêu cầu]
    ↓
[Claude AI tạo nội dung]
    ↓
[Gửi đến Webhook]
    ↓
[n8n xử lý tiếp]
```

## Tính năng chính

- 🤖 **Tích hợp Claude AI**: Sử dụng mô hình Claude 3.5 Sonnet để tạo nội dung chất lượng cao
- 🔄 **Backup AI Provider**: Tự động chuyển sang OpenRouter nếu Claude gặp sự cố
- 📝 **Tạo nội dung đa dạng**:
  - Tạo 10 đề xuất tiêu đề bài viết
  - Dàn ý chi tiết với phân tích mục tiêu
  - Bài viết hoàn chỉnh với SEO metadata
- 🪝 **Webhook Integration**: Gửi tự động kết quả đến webhook (n8n/custom server)
- 💬 **Telegram Bot**: Giao diện đơn giản, tương tác bằng tin nhắn
- ⚡ **Rate Limiting**: Bảo vệ API và tránh spam
- 🔄 **Retry Logic**: Tự động thử lại khi gặp lỗi mạng
- 📊 **Logging**: Theo dõi chi tiết hoạt động của bot
- 🎛️ **Web UI**: Giao diện cấu hình trực quan
- 🚀 **Hai chế độ hoạt động**: Webhook hoặc Polling

## Công nghệ sử dụng

- **Backend**: Node.js + TypeScript
- **Framework**: Express.js
- **AI Provider**:
  - Anthropic Claude AI (primary)
  - OpenRouter AI (backup)
- **Bot Framework**: node-telegram-bot-api
- **Cache**: NodeCache / Redis
- **Logging**: Pino
- **Validation**: Zod

## Cài đặt

### Yêu cầu hệ thống

- Node.js >= 18.0.0
- npm hoặc yarn
- Telegram Bot Token
- Claude API Key hoặc OpenRouter API Key

### Các bước cài đặt

1. **Clone repository**
```bash
git clone <repository-url>
cd file-chuan
```

2. **Cài đặt dependencies**
```bash
npm install
```

3. **Build project**
```bash
npm run build
```

4. **Chạy bot**

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

Hoặc sử dụng PM2:
```bash
pm2 start ecosystem.config.js
```

## Sử dụng

### Các lệnh Telegram

- `/start` - Bắt đầu sử dụng bot
- `/help` - Hiển thị hướng dẫn
- `/generate <chủ đề>` - Bắt đầu tạo nội dung
- `/cancel` - Hủy quá trình đang thực hiện
- `/stats` - Xem thống kê sử dụng

### Quy trình tạo nội dung

1. **Gửi lệnh `/generate` rồi nhập chủ đề cần tạo**
   ```
   /generate cách làm bánh mì Việt Nam
   ```

2. **Bot tạo 10 tiêu đề đề xuất**
   - Chọn một tiêu đề bằng cách reply số từ 1-10

3. **Bot tạo dàn ý chi tiết**

4. **Bot tạo bài viết hoàn chỉnh**

5. **Bài viết hoàn chỉnh được gửi tới webhook**

### Webhook Payload

Khi gửi đến n8n, payload có cấu trúc:

**Dàn ý (Outline)**:
```json
{
  "type": "outline",
  "data": {
    "outline": {
      "inference": {
        "targetKeyword": "từ khóa mục tiêu",
        "targetAudience": "đối tượng mục tiêu",
        "contentPurpose": "mục đích nội dung",
        "estimatedWordCount": "2000-2500 từ"
      },
      "outline": [
        {
          "heading": "Tiêu đề chính",
          "subheadings": ["Tiêu đề phụ 1", "Tiêu đề phụ 2"],
          "notes": "Ghi chú"
        }
      ]
    }
  },
  "userId": "123456789",
  "chatId": 123456789
}
```

**Bài viết (Article)**:
```json
{
  "type": "article",
  "data": {
    "article": {
      "content": "Nội dung bài viết đầy đủ...",
      "metaDescription": "Mô tả SEO",
      "wordCount": 2345,
      "suggestedTags": ["tag1", "tag2", "tag3"]
    }
  },
  "userId": "123456789",
  "chatId": 123456789
}
```

## Cấu trúc thư mục

```
file-chuan/
├── src/
│   ├── app.ts                      # Entry point
│   ├── config/                     # Quản lý cấu hình
│   ├── controllers/                # Controllers
│   │   ├── configController.ts
│   │   └── telegramController.ts
│   ├── services/
│   │   ├── ai/                     # AI services
│   │   │   ├── aiRouter.ts
│   │   │   ├── claudeService.ts
│   │   │   └── openRouterService.ts
│   │   ├── content/                # Content generation
│   │   │   ├── contentService.ts
│   │   │   └── conversationManager.ts
│   │   └── telegram/               # Telegram services
│   │       ├── botManager.ts
│   │       └── telegramService.ts
│   ├── prompts/                    # AI prompts
│   │   ├── titleGenerator.ts
│   │   ├── outlineGenerator.ts
│   │   └── articleGenerator.ts
│   ├── utils/                      # Utilities
│   │   ├── webhook.ts              # Webhook sender
│   │   ├── logger.ts
│   │   ├── rateLimiter.ts
│   │   ├── retry.ts
│   │   └── validation.ts
│   └── types/                      # TypeScript types
├── public/                         # Web UI
├── dist/                           # Compiled code
├── config.json                     # Runtime config
├── ecosystem.config.js             # PM2 config
├── package.json
└── tsconfig.json
```

## Troubleshooting

### Bot không phản hồi

1. Kiểm tra Bot Token trong `config.json`
2. Kiểm tra logs: `pm2 logs telegram-content-bot`
3. Thử restart: `pm2 restart telegram-content-bot`

### Webhook gửi thất bại

1. Kiểm tra URL webhook có đúng không
2. Kiểm tra server n8n có hoạt động không
3. Xem logs chi tiết về lỗi webhook
4. Bot sẽ tự động retry 3 lần với delay 3s

### AI timeout

1. Tăng `aiRequestTimeout` trong config
2. Giảm `maxTokens` cho phù hợp
3. Kiểm tra kết nối mạng đến API

### Rate limit

1. Điều chỉnh `maxRequestsPerMinute` trong config
2. Vô hiệu hóa rate limit: `"enabled": false`

## Bảo mật

- ✅ Sử dụng Helmet.js cho security headers
- ✅ Secret token cho webhook
- ✅ Rate limiting
- ✅ Input validation với Zod
- ✅ Environment variables cho sensitive data
- ⚠️ Không commit `config.json` lên git

## Performance

- ✅ Caching với NodeCache/Redis
- ✅ Retry logic với exponential backoff
- ✅ Timeout cho API requests
- ✅ Graceful shutdown
- ✅ Error recovery

## License

MIT License

## Liên hệ & Hỗ trợ

**Tác giả**: Tám Công Nghệ

Nếu gặp vấn đề hoặc có câu hỏi, vui lòng tạo issue trên GitHub repository.

---

**Lưu ý**: Dự án này sử dụng Claude AI - vui lòng tuân thủ [Terms of Service](https://www.anthropic.com/legal/aup) của Anthropic khi sử dụng.
