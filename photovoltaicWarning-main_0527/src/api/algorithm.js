import axios from '../utils/request'

//算法信息展示
export function getAlgorithm(params) {
  return axios.get('/pvs/algorithms/list', { params })
}

//获取模块数据
export function getModuleList(params) {
    return axios.get('/pvs/module/list', { params })
}