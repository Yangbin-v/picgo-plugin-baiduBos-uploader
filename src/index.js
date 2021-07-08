const crypto_ = require('crypto')
const config = (ctx) => {
  let userConfig = ctx.getConfig('picBed.baiduBos-uploader')
  if (!userConfig) {
    userConfig = {}
  }
  const config = [
    {
      name: 'accessKey',
      type: 'input',
      default: userConfig.accessKey || '',
      message: 'AccessKey不能为空',
      required: true
    },
    {
      name: 'secretKey',
      type: 'input',
      default: userConfig.secretKey || '',
      message: 'SecretKey不能为空',
      required: true
    },
    {
      name: 'bucketName',
      type: 'input',
      default: userConfig.bucketName || '',
      message: 'BucketName不能为空',
      required: true
    },
    {
      name: 'region',
      type: 'input',
      alias: '地区',
      default: userConfig.region || '',
      message: '例如：bj.bcebos.com',
      required: true
    },
    {
      name: 'path',
      type: 'input',
      alias: '存储路径',
      default: userConfig.path || '',
      message: '例如：blog/img',
      required: false
    },
    {
      name: 'customUrl',
      type: 'input',
      alias: '自定义域名',
      default: userConfig.customUrl || '',
      message: '例如：http://bucket.xxx.com',
      required: false
    }
  ]
  return config
}

const generateSignature = (ctx, userConfig, fileName, date) => {
  const accessKey = userConfig.accessKey
  const secretKey = userConfig.secretKey
  const bucketName = userConfig.bucketName
  const path = (userConfig.path) ? userConfig.path + '/' : ''

  const canonicalRequest = `PUT\n/v1/${bucketName}/${encodeURI(path)}${encodeURI(fileName)}\n\nx-bce-date:${encodeURIComponent(date)}`
  const authStringPrefix = `bce-auth-v1/${accessKey}/${date}/1800`
  const signingKey = crypto_.createHmac('sha256', secretKey).update(authStringPrefix).digest('hex')
  const signature = crypto_.createHmac('sha256', signingKey).update(canonicalRequest).digest('hex')
  const authorization = `bce-auth-v1/${accessKey}/${date}/1800/x-bce-date/${signature}`
  ctx.log.info(canonicalRequest)
  ctx.log.info(signingKey)
  ctx.log.info(authorization)
  ctx.emit('notification', {
    title: '上传失败！',
    body: '请检查你的配置项是否正确'
  })
  return authorization
}

const requestConstruct= (userConfig, fileName, signature, img, dateUTC, dateISO) => {
  const bucketName = userConfig.bucketName
  const host = userConfig.region
  const path = (userConfig.path) ? userConfig.path + '/' : ''

  return {
    method: 'PUT',
    uri: `http://${host}/v1/${bucketName}/${encodeURI(path)}${encodeURI(fileName)}`,
    headers: {
      Authorization: signature,
      Date: dateUTC,
      'x-bce-date': dateISO
    },
    body: img,
    resolveWithFullResponse: true
  }
}

const handle = async (ctx) => {
  ctx.emit('notification', {
    title: '上传失败！',
    body: '请检查你的配置项是否正确'
  })
  const userConfig = ctx.getConfig('picBed.baiduBos-uploader')
  if (!userConfig) {
    throw new Error('未配置参数，请配置百度BOS上传参数')
  }
  const bucketName = userConfig.bucketName
  const host = userConfig.region
  const path = (userConfig.path) ? userConfig.path + '/' : ''
  const customUrl = userConfig.customUrl
  let dateISO = new Date().toISOString()
  dateISO = dateISO.slice(0, dateISO.indexOf('.')) + 'Z'
  const dateUTC = new Date().toUTCString()
  try {
    const imgList = ctx.output
    for (let i in imgList) {
      const signature = generateSignature(ctx, userConfig, imgList[i].fileName, dateISO)
      let img = imgList[i].buffer
      if (!img && imgList[i].base64Image) {
        img = Buffer.from(imgList[i].base64Image, 'base64')
      }
      const request = requestConstruct(userConfig, imgList[i].fileName, signature, img, dateUTC,dateISO)
      ctx.log.info(dateISO)
      const response = await ctx.Request.request(request)
      if (response.statusCode === 200 || response.statusCode === 201) {
        delete imgList[i].base64Image
        delete imgList[i].buffer
        const url = (customUrl) ? `${customUrl}/${encodeURI(path)}${encodeURI(imgList[i].fileName)}` : `https://${bucketName}.${host}/${encodeURI(path)}${encodeURI(imgList[i].fileName)}`
        imgList[i]['imgUrl'] = url
      } else {
        throw new Error('Upload failed')
      }
    }
    return ctx
  } catch (err) {
    if (err.error === 'Upload failed') {
      ctx.emit('notification', {
        title: '上传失败！',
        body: '请检查你的配置项是否正确'
      })
    } else {
      ctx.emit('notification', {
        title: '上传失败！',
        body: '请检查你的配置项是否正确'
      })
    }
    throw err
  }
}

module.exports = (ctx) => {
  const register = () => {
    ctx.log.success('百度BOS加载成功')
    ctx.helper.uploader.register('baiduBos-uploader', {
      handle: handle,
      config: config,
      name: '百度BOS'
    })
  }
  return {
    register,
    uploader: 'baiduBos-uploader'
  }
}
