import { Cinema } from './models';

export const CINEMAS: Cinema[] = [
  {
    city: '北京市',
    city_code: 'beijing',
    areas: [
      {
        name: '小西天',
        area_code: 'xiaoxitian',
        location: '海淀区文慧园路 3 号小西天艺术影院',
        lat: 39.952908,
        lng: 116.369569,
        theatres: [
          {
            name: '1号厅',
            theatre_code: '1',
            keywords: ['小西天', '1']
          },
          {
            name: '2号厅',
            theatre_code: '2',
            keywords: ['小西天', '2']
          }
        ]
      },
      {
        name: '百子湾',
        area_code: 'baiziwan',
        location: '北京市朝阳区百子湾南二路 2 号百子湾艺术影院',
        lat: 39.896749,
        lng: 116.511986,
        theatres: [
          {
            name: '1 号厅',
            theatre_code: '1',
            keywords: ['百子湾', '1']
          }
        ]
      }
    ]
  },
  {
    city: '苏州市',
    city_code: 'suzhou',
    areas: [
      {
        name: '江南分馆',
        area_code: 'jiangnan',
        location: '苏州市姑苏区景德路 523 号长船湾青年码头东岸中国电影资料馆江南分馆',
        lat: 31.309049,
        lng: 120.607034,
        theatres: [
          {
            name: '1 号厅',
            theatre_code: '1',
            keywords: ['江南', '1']
          },
          {
            name: '2 号厅',
            theatre_code: '2',
            keywords: ['江南', '2']
          },
          {
            name: '3 号厅',
            theatre_code: '3',
            keywords: ['江南', '3']
          },
          {
            name: '4 号厅',
            theatre_code: '4',
            keywords: ['江南', '4']
          }
        ]
      }
    ]
  }
];
